"""
Translation controller — /translations/* endpoints.

Public, unauthenticated routes: called directly from anonymous visitor
browsers on customer sites (via the SDK), same trust level as
webhook_controller.py's public routes. Rate-limited via the shared slowapi
limiter instead of JWT auth.

Endpoints are kept resource-shaped (siteId in body/query, not path-baked)
so a future Admin UI or batch translation tool can reuse them without a
breaking change, even though only one siteId is valid in this phase.
"""

import logging
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, Field

from app.models.requests.translation_requests import (
    TranslationApproveRequest,
    TranslationRejectRequest,
    TranslationUpdateRequest,
)
from app.models.responses.translation import TranslationResponse
from app.platform.auth.dependencies import require_admin, require_admin_or_reviewer
from app.platform.security import limiter
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.translation_service import TranslationService, get_translation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/translations", tags=["Translations"])


class ExtractItem(BaseModel):
    key: str
    text: str
    route: str
    sourceLang: str = "en"


class ExtractRequest(BaseModel):
    siteId: str
    items: list[ExtractItem] = Field(default_factory=list)


@router.post("/extract", summary="Submit extracted DOM text for translation", status_code=202)
@limiter.limit("100/minute")
async def extract(
    request: Request,
    body: ExtractRequest,
    service: TranslationService = Depends(get_translation_service),
) -> dict[str, Any]:
    await service.extract_items(body.siteId, [item.model_dump() for item in body.items])
    return {"status": "accepted"}


@router.get("", summary="Get approved translations for a route + language (unapproved falls back to source text)")
@limiter.limit("300/minute")
async def get_translations(
    request: Request,
    siteId: str,
    route: str,
    lang: str,
    service: TranslationService = Depends(get_translation_service),
) -> dict[str, str]:
    # On-demand runtime path: any item on this route that has no translation for
    # `lang` yet is generated inline (glossary -> TM -> AI, batched) and stored,
    # so a freshly-injected website translates into the selected language on the
    # first switch and instantly thereafter. Backed by a batch, no-daily-cap MT
    # provider (Azure); transient failures fall back to source text, never stall.
    return await service.runtime_translate(siteId, route, lang)


def _reviewer_id(user: dict[str, Any]) -> str:
    return user.get("email") or user.get("sub", "")


@router.get("/analytics/summary", summary="Get basic dashboard analytics")
async def get_analytics_summary(
    siteId: str | None = None,
    service: AnalyticsService = Depends(get_analytics_service),
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, int]:
    return await service.get_summary(siteId)


@router.get("/list", summary="List translation documents for reviewer/admin workflows")
async def list_translations(
    siteId: str,
    route: str | None = None,
    status: str | None = None,
    lowConfidence: bool = False,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> list[dict[str, Any]]:
    docs = await service.list_translations(siteId, route, status, low_confidence_only=lowConfidence)
    return [TranslationResponse.from_doc(doc) for doc in docs]


@router.get("/audit", summary="Append-only audit trail: who translated/edited/approved/rejected, and when")
async def get_audit_trail(
    siteId: str,
    route: str | None = None,
    key: str | None = None,
    action: str | None = None,
    limit: int = 200,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> list[dict[str, Any]]:
    entries = await service.get_audit_trail(siteId, route=route, key=key, action=action, limit=limit)
    return [
        {k: str(v) if isinstance(v, ObjectId) else v for k, v in entry.items()}
        for entry in entries
    ]


@router.get("/{translation_id}/versions", summary="Get the approved version history of a translation")
async def get_version_history(
    translation_id: str,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> list[dict[str, Any]]:
    history = await service.get_version_history(translation_id)
    return [
        {k: str(v) if isinstance(v, ObjectId) else v for k, v in doc.items()}
        for doc in history
    ]


@router.get("/{translation_id}", summary="Get a single translation document for review")
async def get_translation(
    translation_id: str,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> dict[str, Any]:
    doc = await service.get_translation(translation_id)
    return TranslationResponse.from_doc(doc)


@router.put("/{translation_id}", summary="Update a translation's edited text")
async def update_translation(
    translation_id: str,
    body: TranslationUpdateRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> dict[str, Any]:
    doc = await service.update_translation(translation_id, body.lang, body.text, editor=_reviewer_id(user))
    return TranslationResponse.from_doc(doc)


@router.post("/{translation_id}/approve", summary="Approve a reviewed translation")
async def approve_translation(
    translation_id: str,
    body: TranslationApproveRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> dict[str, Any]:
    doc = await service.approve_translation(translation_id, _reviewer_id(user))
    return TranslationResponse.from_doc(doc)


@router.post("/{translation_id}/reject", summary="Reject a translation, returning it to draft for re-edit")
async def reject_translation(
    translation_id: str,
    body: TranslationRejectRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> dict[str, Any]:
    doc = await service.reject_translation(translation_id, _reviewer_id(user), body.reason)
    return TranslationResponse.from_doc(doc)
