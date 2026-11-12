from __future__ import annotations

from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import OAuth2PasswordBearer

from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreate,
    PartnerContentListQuery,
    PartnerContentUpdate,
    TenantIdsHeader,
)
from app.models.responses.content import ContentItem, ContentPageResponse
from app.models.responses.content_aggregator import PartnerJobsResponse, PartnerJobStatusResponse
from app.models.responses.job import DeleteMatchedResponse
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.security import limiter
from app.platform.settings import Settings, get_settings
from app.services.content_aggregator._jwt import AccessTokenClaims, decode_access_token
from app.services.content_aggregator.content import (
    PartnerContentService,
    get_partner_content_service,
)

router = APIRouter(prefix="/v1/content", tags=["Content Aggregator Content"])

_partner_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token")

class PartnerScope(StrEnum):
    CONTENT_READ = "content:read"
    CONTENT_WRITE = "content:write"
    CONTENT_DELETE = "content:delete"


_REQUIRED_CLAIMS = ("sub", "tenant_ids", "scopes", "client_name")


async def verify_client_token(
    token: str = Depends(_partner_oauth2_scheme),
    settings: Settings = Depends(get_settings),
) -> AccessTokenClaims:
    claims = decode_access_token(token, secret_key=settings.secret_key)
    if any(key not in claims for key in _REQUIRED_CLAIMS):
        raise UnauthorizedError("Invalid token")
    return claims


def _client_rate_key(request: Request) -> str:
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    return decode_access_token(token, secret_key=get_settings().secret_key)["sub"]


def require_scope(scope: PartnerScope) -> Callable[..., Awaitable[AccessTokenClaims]]:
    async def _check(claims: AccessTokenClaims = Depends(verify_client_token)) -> AccessTokenClaims:
        if scope not in claims["scopes"]:
            raise AppError("SCOPE_INSUFFICIENT", f"scope '{scope}' required", 403)
        return claims

    return _check


async def get_tenant_id(
    x_tenant_ids: Annotated[str, Header(alias="x-tenant-ids")],
    claims: AccessTokenClaims = Depends(verify_client_token),
) -> str:
    header = TenantIdsHeader.model_validate(
        {"ids": x_tenant_ids}, context={"allowed": claims["tenant_ids"], "single": True}
    )
    return header.ids[0]


async def get_tenant_ids(
    x_tenant_ids: Annotated[str, Header(alias="x-tenant-ids")],
    claims: AccessTokenClaims = Depends(verify_client_token),
) -> list[str]:
    header = TenantIdsHeader.model_validate(
        {"ids": x_tenant_ids}, context={"allowed": claims["tenant_ids"], "single": False}
    )
    return header.ids


@router.post("", summary="Push a single piece of content to one or more tenants")
@limiter.limit("10/minute", key_func=_client_rate_key)
async def create_content(
    request: Request,
    body: PartnerContentCreate,
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_WRITE)),
    tenant_ids: list[str] = Depends(get_tenant_ids),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerJobsResponse:
    return await service.create(tenant_ids, body)


@router.get("/job/{job_id}", summary="Get ingestion status for a job")
async def get_job_status(
    job_id: str,
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_READ)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerJobStatusResponse:
    return await service.get_job_status(tenant_id, job_id)


@router.get("/{content_id}", summary="Get a single content item")
async def get_content(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_READ)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> ContentItem:
    return await service.get(tenant_id, content_id)


@router.get("", summary="List content for this tenant")
async def list_content(
    query: Annotated[PartnerContentListQuery, Query()],
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_READ)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> ContentPageResponse:
    return await service.list(tenant_id, query)


@router.patch("/{content_id}", summary="Update a content item")
async def update_content(
    content_id: str,
    body: PartnerContentUpdate,
    is_audio_uploaded: bool = Query(False, alias="isAudioUploaded"),
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_WRITE)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> ContentItem:
    return await service.update(tenant_id, content_id, body, is_audio_uploaded)


@router.delete("/{content_id}", summary="Soft-delete a content item")
async def delete_content(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_DELETE)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> DeleteMatchedResponse:
    return await service.delete(tenant_id, content_id)
