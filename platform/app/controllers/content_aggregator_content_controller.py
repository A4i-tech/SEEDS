from __future__ import annotations

import uuid
from collections.abc import Awaitable, Callable
from enum import StrEnum
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, Request
from fastapi.security import OAuth2PasswordBearer
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content import Content
from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreate,
    PartnerContentListQuery,
    PartnerContentUpdate,
    TenantIdsHeader,
)
from app.models.responses.content_aggregator import (
    PartnerContentPageResponse,
    PartnerContentStatusResponse,
    PartnerContentUpdateResponse,
    PartnerDeleteResponse,
    PartnerJobsResponse,
    PartnerPagination,
)
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import AppError
from app.platform.security import limiter
from app.platform.settings import Settings, get_settings
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository
from app.services.content_aggregator._jwt import AccessTokenClaims, decode_access_token
from app.services.content_aggregator.content import PartnerContentService

router = APIRouter(prefix="/v1/content", tags=["Content Aggregator Content"])

_partner_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token")

_SUPPORTED_CONTENT_TYPES = {"story", "audio", "quiz"}


class PartnerScope(StrEnum):
    CONTENT_READ = "content:read"
    CONTENT_WRITE = "content:write"
    CONTENT_DELETE = "content:delete"


async def verify_client_token(
    token: str = Depends(_partner_oauth2_scheme),
    settings: Settings = Depends(get_settings),
) -> AccessTokenClaims:
    return decode_access_token(token, secret_key=settings.secret_key)


def _client_rate_key(request: Request) -> str:
    token = request.headers.get("authorization", "").removeprefix("Bearer ").strip()
    return decode_access_token(token, secret_key=get_settings().secret_key)["sub"]


def require_scope(scope: PartnerScope) -> Callable[..., Awaitable[AccessTokenClaims]]:
    async def _check(claims: AccessTokenClaims = Depends(verify_client_token)) -> AccessTokenClaims:
        if scope not in claims["scope"].split():
            raise AppError("SCOPE_INSUFFICIENT", f"scope '{scope}' required", 403)
        return claims

    return _check


def _parse_tenant_ids(x_tenant_ids: str, claims: AccessTokenClaims, *, single: bool = False) -> list[str]:
    return TenantIdsHeader.model_validate(
        {"ids": x_tenant_ids}, context={"allowed": claims["tenant_ids"], "single": single}
    ).ids


async def get_tenant_id(
    x_tenant_ids: Annotated[str, Header(alias="x-tenant-ids")],
    claims: AccessTokenClaims = Depends(verify_client_token),
) -> str:
    return _parse_tenant_ids(x_tenant_ids, claims, single=True)[0]


async def get_tenant_ids(
    x_tenant_ids: Annotated[str, Header(alias="x-tenant-ids")],
    claims: AccessTokenClaims = Depends(verify_client_token),
) -> list[str]:
    return _parse_tenant_ids(x_tenant_ids, claims)


def get_partner_content_service(db: AsyncDatabase = Depends(get_db)) -> PartnerContentService:
    return PartnerContentService(
        ContentAggregatorRepository(db), ContentRepository(db), ContentJobRepository(db)
    )


@router.post("", summary="Push a single piece of content to one or more tenants")
@limiter.limit("10/minute", key_func=_client_rate_key)
async def create_content(
    request: Request,
    body: PartnerContentCreate,
    idempotency_key: Annotated[str, Header(alias="Idempotency-Key")] = "",
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_WRITE)),
    tenant_ids: list[str] = Depends(get_tenant_ids),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerJobsResponse:
    if body.type not in _SUPPORTED_CONTENT_TYPES:
        raise AppError("UNSUPPORTED_CONTENT_TYPE", f"Unsupported content type: {body.type}", 400)
    content_id = idempotency_key or str(uuid.uuid4())
    jobs: dict[str, str] = {}
    for tenant_id in tenant_ids:
        doc, created = await service.create_item(tenant_id, claims["sub"], content_id, body)
        if created:
            job_id = await service.enqueue_content_job(tenant_id, content_id)
            await service.record_job(tenant_id, content_id, job_id)
        elif not doc.get("job_id"):
            raise AppError("INGEST_IN_PROGRESS", "ingest for this Idempotency-Key is still being scheduled", 409)
        else:
            job_id = doc["job_id"]
        jobs[tenant_id] = job_id
    return PartnerJobsResponse(jobs=jobs)


@router.get("/{content_id}", summary="Get a single content item")
async def get_content(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_READ)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> Content:
    doc = await service.get_item(tenant_id, content_id)
    return Content.from_mongo(doc)


@router.get("", summary="List content for this tenant")
async def list_content(
    query: Annotated[PartnerContentListQuery, Query()],
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_READ)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerContentPageResponse:
    items, next_cursor, has_more = await service.list_items(tenant_id, query)
    return PartnerContentPageResponse(
        data=[Content.from_mongo(doc) for doc in items],
        pagination=PartnerPagination(next_cursor=next_cursor, has_more=has_more, limit=query.limit),
    )


@router.get("-status/{content_id}", summary="Get ingestion status for a content item")
async def get_content_status(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_READ)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerContentStatusResponse:
    return await service.get_status(tenant_id, content_id)


@router.patch("/{content_id}", summary="Update a content item")
async def update_content(
    content_id: str,
    body: PartnerContentUpdate,
    is_audio_uploaded: bool = Query(False, alias="isAudioUploaded"),
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_WRITE)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerContentUpdateResponse:
    doc = await service.update_item(tenant_id, content_id, body, is_audio_uploaded=is_audio_uploaded)
    job_id = await service.enqueue_content_job(tenant_id, content_id) if is_audio_uploaded else ""
    return PartnerContentUpdateResponse(
        **Content.from_mongo(doc).model_dump(),
        job_id=job_id,
        updated_fields=list(body.model_dump(exclude_unset=True, exclude_none=True)),
    )


@router.delete("/{content_id}", summary="Soft-delete a content item")
async def delete_content(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope(PartnerScope.CONTENT_DELETE)),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> PartnerDeleteResponse:
    acknowledged, matched, modified = await service.delete_item(tenant_id, content_id)
    return PartnerDeleteResponse(acknowledged=acknowledged, matched_count=matched, modified_count=modified)
