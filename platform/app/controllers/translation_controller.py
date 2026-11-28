import logging
from typing import Any

from fastapi import APIRouter, Depends, Query, Request
from pydantic import BaseModel, Field, field_validator

from app.models.requests.translation_requests import (
    BulkApproveRequest,
    RuleRequest,
    TranslationApproveRequest,
    TranslationRejectRequest,
    TranslationUpdateRequest,
)
from app.models.responses.common import StatusResponse
from app.models.responses.translation import (
    AuditEntryResponse,
    RuleResponse,
    TranslationResponse,
    TranslationVersionResponse,
)
from app.platform.auth.dependencies import require_tenant, require_translation_reviewer
from app.platform.security import limiter
from app.services.analytics_service import AnalyticsService, get_analytics_service
from app.services.translation_service import TranslationService, get_translation_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/translations", tags=["Translations"])


def _tenant_id(user: dict[str, Any]) -> str:
    return user["sub"]


class ExtractItem(BaseModel):
    key: str
    text: str = Field(max_length=5000)
    route: str = Field(max_length=2048)
    source_lang: str = "en"

    @field_validator("key")
    @classmethod
    def _key_is_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Key must not be blank.")
        return value


class ExtractRequest(BaseModel):
    site_id: str
    items: list[ExtractItem] = Field(default_factory=list, max_length=500)


@router.post("/extract", summary="Submit extracted DOM text for translation", status_code=202)
@limiter.limit("100/minute")
async def extract(
    request: Request,
    body: ExtractRequest,
    service: TranslationService = Depends(get_translation_service),
) -> StatusResponse:
    await service.extract_items(
        body.site_id,
        [item.model_dump() for item in body.items],
    )
    return StatusResponse(status="accepted")


@router.get(
    "",
    summary="Get approved translations for a route + language (page-approved text wins, then override text, excluded text stays source, else source text)",
)
@limiter.limit("300/minute")
async def get_translations(
    request: Request,
    site_id: str,
    route: str = Query(max_length=2048),
    lang: str = Query(max_length=32),
    service: TranslationService = Depends(get_translation_service),
) -> dict[str, str]:
    return await service.runtime_translate(site_id, route, lang)


@router.post(
    "/generate",
    summary="Authenticated on-demand translation generation for the Review/Admin workflow",
)
async def generate_translations(
    site_id: str,
    route: str = Query(max_length=2048),
    lang: str = Query(max_length=32),
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> dict[str, str]:
    return await service.generate_for_review(site_id, _tenant_id(user), route, lang)


def _reviewer_id(user: dict[str, Any]) -> str:
    return user.get("email") or user.get("sub", "")


@router.get("/analytics/summary", summary="Get basic dashboard analytics")
async def get_analytics_summary(
    site_id: str,
    service: AnalyticsService = Depends(get_analytics_service),
    user: dict[str, Any] = Depends(require_tenant),
) -> dict[str, int]:
    return await service.get_summary(site_id, _tenant_id(user))


@router.get(
    "/list",
    summary="List translation documents for reviewer/admin workflows",
    response_model=list[TranslationResponse],
)
async def list_translations(
    site_id: str,
    route: str | None = None,
    status: str | None = None,
    low_confidence: bool = False,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> list[TranslationResponse]:
    docs = await service.list_translations(
        site_id, _tenant_id(user), route, status, low_confidence_only=low_confidence
    )
    return [TranslationResponse.from_doc(doc) for doc in docs]


@router.get("/pages", summary="List the routes a site has translations for, most recently updated first")
async def list_pages(
    site_id: str,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> list[str]:
    return await service.list_routes(site_id, _tenant_id(user))


@router.post(
    "/bulk-approve",
    summary="Approve all pending translations for a site (optionally scoped to route/lang)",
)
async def bulk_approve_translations(
    site_id: str,
    body: BulkApproveRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> dict[str, int]:
    return await service.bulk_approve_pending(
        site_id, _tenant_id(user), _reviewer_id(user), route=body.route, lang=body.lang
    )


@router.get(
    "/audit",
    summary="Append-only audit trail: who translated/edited/approved/rejected, and when",
    response_model=list[AuditEntryResponse],
)
async def get_audit_trail(
    site_id: str,
    route: str | None = None,
    key: str | None = None,
    action: str | None = None,
    limit: int = 200,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> list[AuditEntryResponse]:
    entries = await service.get_audit_trail(
        site_id, _tenant_id(user), route=route, key=key, action=action, limit=limit
    )
    return [AuditEntryResponse.from_doc(entry) for entry in entries]


@router.get(
    "/rules",
    summary="List a site's exclusion and override rules",
    response_model=list[RuleResponse],
)
async def list_rules(
    site_id: str,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> list[RuleResponse]:
    rules = await service.list_rules(site_id, _tenant_id(user))
    return [RuleResponse.from_doc(rule) for rule in rules]


@router.post(
    "/rules",
    summary="Add an exclusion or override rule to a site",
    response_model=RuleResponse,
    status_code=201,
)
async def add_rule(
    site_id: str,
    body: RuleRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> RuleResponse:
    rule = await service.add_rule(site_id, _tenant_id(user), body.model_dump(), _reviewer_id(user))
    return RuleResponse.from_doc(rule)


@router.put(
    "/rules/{rule_id}",
    summary="Edit a rule",
    response_model=RuleResponse,
)
async def update_rule(
    rule_id: str,
    body: RuleRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> RuleResponse:
    rule = await service.update_rule(rule_id, _tenant_id(user), body.model_dump(), _reviewer_id(user))
    return RuleResponse.from_doc(rule)


@router.delete("/rules/{rule_id}", summary="Delete a rule", status_code=204)
async def delete_rule(
    rule_id: str,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> None:
    await service.delete_rule(rule_id, _tenant_id(user), _reviewer_id(user))


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
    history = await service.get_version_history(translation_id, _tenant_id(user))
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
    doc = await service.get_translation(translation_id, _tenant_id(user))
    return TranslationResponse.from_doc(doc)


@router.put(
    "/{translation_id}",
    summary="Update a translation's edited text (also approves it when an override applies)",
    response_model=TranslationResponse,
)
async def update_translation(
    translation_id: str,
    body: TranslationUpdateRequest,
    service: TranslationService = Depends(get_translation_service),
    user: dict[str, Any] = Depends(require_translation_reviewer),
) -> TranslationResponse:
    doc = await service.update_translation(
        translation_id, _tenant_id(user), body.lang, body.text, editor=_reviewer_id(user)
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
    doc = await service.approve_translation(translation_id, _tenant_id(user), body.lang, _reviewer_id(user))
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
    doc = await service.reject_translation(
        translation_id, _tenant_id(user), body.lang, _reviewer_id(user), body.reason
    )
    return TranslationResponse.from_doc(doc)
