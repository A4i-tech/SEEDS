from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from fastapi.security import OAuth2PasswordBearer
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreateRequest,
    PartnerContentUpdateRequest,
)
from app.models.responses.content_aggregator import (
    PartnerContentResponse,
    PartnerContentStatusResponse,
    PartnerContentUpdateResponse,
    PartnerDeleteResponse,
    PartnerJobsResponse,
)
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import AppError
from app.platform.settings import Settings, get_settings
from app.providers.blob_storage import BlobStorageProvider, get_blob_storage_provider
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.services.content_aggregator._jwt import AccessTokenClaims, decode_access_token
from app.services.content_aggregator.content import PartnerContentService
from app.services.content_service import ContentService, get_content_service

router = APIRouter(prefix="/v1/content", tags=["Content Aggregator Content"])

_partner_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token")


class PartnerScope(StrEnum):
    CONTENT_READ = "content:read"
    CONTENT_WRITE = "content:write"
    CONTENT_DELETE = "content:delete"


async def verify_client_token(
    token: str = Depends(_partner_oauth2_scheme),
    settings: Settings = Depends(get_settings),
) -> AccessTokenClaims:
    return decode_access_token(token, secret_key=settings.secret_key)


def require_scope(scope: PartnerScope) -> Callable[..., Awaitable[AccessTokenClaims]]:
    async def _check(claims: AccessTokenClaims = Depends(verify_client_token)) -> AccessTokenClaims:
        if scope not in claims["scope"].split():
            raise AppError("SCOPE_INSUFFICIENT", f"scope '{scope}' required", 403)
        return claims

    return _check


def _parse_tenant_ids(x_tenant_ids: str, claims: AccessTokenClaims) -> list[str]:
    tenant_ids = [t.strip() for t in x_tenant_ids.split(",") if t.strip()]
    if not tenant_ids:
        raise AppError("TENANT_NOT_ALLOWED", "x-tenant-ids is required", 403)
    allowed = set(claims["tenant_ids"])
    if any(t not in allowed for t in tenant_ids):
        raise AppError("TENANT_NOT_ALLOWED", "tenant not allowed for this client", 403)
    return tenant_ids


async def get_tenant_id(
    x_tenant_ids: Annotated[str, Header(alias="x-tenant-ids")],
    claims: AccessTokenClaims = Depends(verify_client_token),
) -> str:
    tenant_ids = _parse_tenant_ids(x_tenant_ids, claims)
    if len(tenant_ids) != 1:
        raise AppError("TENANT_NOT_ALLOWED", "exactly one tenant id is required", 403)
    return tenant_ids[0]


async def get_tenant_ids(
    x_tenant_ids: Annotated[str, Header(alias="x-tenant-ids")],
    claims: AccessTokenClaims = Depends(verify_client_token),
) -> list[str]:
    return _parse_tenant_ids(x_tenant_ids, claims)


def get_partner_content_service(
    db: AsyncDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings),
    blob: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> PartnerContentService:
    return PartnerContentService(ContentAggregatorRepository(db), blob, settings.content_aggregator_asset_container)


@router.post("", summary="Push a single piece of content to one or more tenants")
async def create_content(
    body: PartnerContentCreateRequest,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")] = "",
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_WRITE)),
    tenant_ids: list[str] = Depends(get_tenant_ids),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerJobsResponse:
    source_id = idempotency_key or str(uuid.uuid4())
    for tenant_id in tenant_ids:
        await service.create_item(tenant_id, claims["sub"], source_id, body)
    return PartnerJobsResponse(jobs=dict.fromkeys(tenant_ids, source_id))


@router.get("/{content_id}", summary="Get a single content item")
async def get_content(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_READ)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerContentResponse:
    node = await service.get_item(tenant_id, claims["sub"], content_id)
    return PartnerContentResponse.model_validate(node, from_attributes=True)


@router.get("", summary="List all content this client has pushed to this tenant")
async def list_content(
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_READ)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> list[PartnerContentResponse]:
    nodes = await service.list_items(tenant_id, claims["sub"])
    return [PartnerContentResponse.model_validate(n, from_attributes=True) for n in nodes]


@router.get("-status/{content_id}", summary="Get ingestion status for a content item")
async def get_content_status(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_READ)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerContentStatusResponse:
    await service.get_item(tenant_id, claims["sub"], content_id)
    return PartnerContentStatusResponse(status="completed")


@router.patch("/{content_id}", summary="Update a content item's content")
async def update_content(
    content_id: str,
    body: PartnerContentUpdateRequest,
    is_audio_uploaded: bool = Query(False, alias="isAudioUploaded"),
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_WRITE)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
    content_service: ContentService = Depends(get_content_service),
) -> PartnerContentUpdateResponse:
    node = await service.update_item(tenant_id, claims["sub"], content_id, body)
    response = PartnerContentUpdateResponse.model_validate(node, from_attributes=True)
    if is_audio_uploaded:
        response.job_id = await content_service.enqueue_content_job(content_id)
    return response


@router.delete("/{content_id}", summary="Soft-delete a content item")
async def delete_content(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_DELETE)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerDeleteResponse:
    acknowledged, matched, modified = await service.delete_item(tenant_id, claims["sub"], content_id)
    return PartnerDeleteResponse(acknowledged=acknowledged, matched_count=matched, modified_count=modified)
