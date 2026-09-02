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

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field

from app.models.requests.translation_requests import (
    BulkApproveRequest,
    TranslationApproveRequest,
    TranslationRejectRequest,
    TranslationUpdateRequest,
)
from app.models.responses.translation import (
    AuditEntryResponse,
    TranslationResponse,
    TranslationVersionResponse,
)
from app.platform.auth.dependencies import (
    require_admin,
    require_admin_or_reviewer,
    require_translation_reviewer,
)
from app.platform.security import limiter
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.translation_service import TranslationService, get_translation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/translations", tags=["Translations"])


class ExtractItem(BaseModel):
    key: str
    text: str = Field(max_length=5000)
    route: str = Field(max_length=2048)
    sourceLang: str = "en"


class ExtractRequest(BaseModel):
    siteId: str
    items: list[ExtractItem] = Field(default_factory=list, max_length=500)


@router.post("/extract", summary="Submit extracted DOM text for translation", status_code=202)
@limiter.limit("100/minute")
async def extract(
    request: Request,
    body: ExtractRequest,
    service: TranslationService = Depends(get_translation_service),
) -> dict[str, Any]:
    await service.extract_items(
        body.siteId,
        [item.model_dump() for item in body.items],
        origin=request.headers.get("origin"),
        referer=request.headers.get("referer"),
    )
    return {"status": "accepted"}


@router.get(
    "",
    summary="Get approved translations for a route + language (unapproved falls back to source text)",
)
@limiter.limit("300/minute")
async def get_translations(
    request: Request,
    siteId: str,
    route: str = Query(max_length=2048),
    lang: str = Query(max_length=32),
    service: TranslationService = Depends(get_translation_service),
) -> dict[str, str]:
    # On-demand runtime path: any item on this route that has no translation for
    # `lang` yet is generated inline (glossary -> TM -> AI, batched) and stored,
    # so a freshly-injected website translates into the selected language on the
    # first switch and instantly thereafter. Backed by a batch, no-daily-cap MT
    # provider (Azure); transient failures fall back to source text, never stall.
    return await service.runtime_translate(
        siteId,
        route,
        lang,
        origin=request.headers.get("origin"),
        referer=request.headers.get("referer"),
    )


@router.post(
    "/generate",
    summary="Authenticated on-demand translation generation for the Review/Admin workflow",
)
async def generate_translations(
    siteId: str,
    route: str = Query(max_length=2048),
    lang: str = Query(max_length=32),
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_admin_or_reviewer),
) -> dict[str, str]:
    # Same glossary -> TM -> AI generation pipeline as GET /translations, but
    # gated by admin/reviewer auth instead of Origin/Referer site-domain
    # binding -- lets the Review UI trigger generation for a site whose
    # registered domain differs from the UI's own origin (e.g. localhost admin
    # console reviewing a production-domain site) without weakening the public
    # runtime endpoint's origin check.
    return await service.generate_for_review(siteId, route, lang)


def _reviewer_id(user: dict[str, Any]) -> str:
    return user.get("email") or user.get("sub", "")


@router.get("/analytics/summary", summary="Get basic dashboard analytics")
async def get_analytics_summary(
    siteId: str | None = None,
    service: AnalyticsService = Depends(get_analytics_service),
    user: dict[str, Any] = Depends(require_admin),
) -> dict[str, int]:
    return await service.get_summary(siteId)


@router.get(
    "/list",
    summary="List translation documents for reviewer/admin workflows",
    response_model=list[TranslationResponse],
)
async def list_translations(
    siteId: str,
    route: str | None = None,
    status: str | None = None,
    lowConfidence: bool = False,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> list[TranslationResponse]:
    docs = await service.list_translations(siteId, route, status, low_confidence_only=lowConfidence)
    return [TranslationResponse.from_doc(doc) for doc in docs]


@router.post(
    "/bulk-approve",
    summary="Approve all pending translations for a site (optionally scoped to route/lang)",
)
async def bulk_approve_translations(
    siteId: str,
    body: BulkApproveRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> dict[str, int]:
    return await service.bulk_approve_pending(siteId, _reviewer_id(user), route=body.route, lang=body.lang)


@router.get(
    "/audit",
    summary="Append-only audit trail: who translated/edited/approved/rejected, and when",
    response_model=list[AuditEntryResponse],
)
async def get_audit_trail(
    siteId: str,
    route: str | None = None,
    key: str | None = None,
    action: str | None = None,
    limit: int = 200,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> list[AuditEntryResponse]:
    entries = await service.get_audit_trail(
        siteId, route=route, key=key, action=action, limit=limit
    )
    return [AuditEntryResponse.from_doc(entry) for entry in entries]


@router.get(
    "/{translation_id}/versions",
    summary="Get the approved version history of a translation",
    response_model=list[TranslationVersionResponse],
)
async def get_version_history(
    translation_id: str,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> list[TranslationVersionResponse]:
    history = await service.get_version_history(translation_id)
    return [TranslationVersionResponse.from_doc(doc) for doc in history]


@router.get(
    "/{translation_id}",
    summary="Get a single translation document for review",
    response_model=TranslationResponse,
)
async def get_translation(
    translation_id: str,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> TranslationResponse:
    doc = await service.get_translation(translation_id)
    return TranslationResponse.from_doc(doc)


@router.put(
    "/{translation_id}",
    summary="Update a translation's edited text",
    response_model=TranslationResponse,
)
async def update_translation(
    translation_id: str,
    body: TranslationUpdateRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> TranslationResponse:
    doc = await service.update_translation(
        translation_id, body.lang, body.text, editor=_reviewer_id(user)
    )
    return TranslationResponse.from_doc(doc)


@router.post(
    "/{translation_id}/approve",
    summary="Approve a reviewed translation",
    response_model=TranslationResponse,
)
async def approve_translation(
    translation_id: str,
    body: TranslationApproveRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> TranslationResponse:
    doc = await service.approve_translation(translation_id, body.lang, _reviewer_id(user))
    return TranslationResponse.from_doc(doc)


@router.post(
    "/{translation_id}/reject",
    summary="Reject a translation, returning it to draft for re-edit",
    response_model=TranslationResponse,
)
async def reject_translation(
    translation_id: str,
    body: TranslationRejectRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> TranslationResponse:
    doc = await service.reject_translation(translation_id, body.lang, _reviewer_id(user), body.reason)
    return TranslationResponse.from_doc(doc)
