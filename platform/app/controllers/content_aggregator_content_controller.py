from __future__ import annotations

import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query
from fastapi.responses import Response
from fastapi.security import OAuth2PasswordBearer
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreateRequest,
    PartnerContentUpdateRequest,
)
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import AppError
from app.platform.settings import Settings, get_settings
from app.providers.blob_storage import BlobStorageProvider, get_blob_storage_provider
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.services.content_aggregator._jwt import AccessTokenClaims
from app.services.content_aggregator.auth import ContentAggregatorAuth
from app.services.content_aggregator.content import PartnerContentService

router = APIRouter(prefix="/v1/content", tags=["Content Aggregator Content"])

_partner_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token")


def get_content_aggregator_auth(
    db: AsyncDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings),
) -> ContentAggregatorAuth:
    return ContentAggregatorAuth(db, settings)


async def verify_client_token(
    token: str = Depends(_partner_oauth2_scheme),
    auth: ContentAggregatorAuth = Depends(get_content_aggregator_auth),
) -> AccessTokenClaims:
    return await auth.verify_token(token)


def require_scope(scope: str):
    async def _check(claims: AccessTokenClaims = Depends(verify_client_token)) -> AccessTokenClaims:
        if scope not in claims["scope"].split():
            raise AppError("SCOPE_INSUFFICIENT", f"scope '{scope}' required", 403)
        return claims

    return _check


async def get_tenant_id(
    x_tenant_ids: Annotated[str, Header(alias="x-tenant-ids")],
    claims: AccessTokenClaims = Depends(verify_client_token),
) -> str:
    if x_tenant_ids not in claims["tenant_ids"]:
        raise AppError("TENANT_NOT_ALLOWED", "tenant not allowed for this client", 403)
    return x_tenant_ids


def get_partner_content_service(
    db: AsyncDatabase = Depends(get_db),
    settings: Settings = Depends(get_settings),
    blob: BlobStorageProvider = Depends(get_blob_storage_provider),
) -> PartnerContentService:
    return PartnerContentService(ContentAggregatorRepository(db), blob, settings.content_aggregator_asset_container)


@router.get("/upload-url", summary="Get an upload SAS URL for an .mp3 or .brf blob")
async def get_upload_url(
    blob_name: str = Query(...),
    claims: AccessTokenClaims = Depends(require_scope("content:write")),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> dict[str, str]:
    return {"sas_token": await service.create_upload_url(blob_name)}


@router.post("", status_code=201, summary="Push a single piece of content")
async def create_content(
    body: PartnerContentCreateRequest,
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    claims: AccessTokenClaims = Depends(require_scope("content:write")),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> list[dict[str, object]]:
    source_id = idempotency_key or str(uuid.uuid4())
    nodes = await service.create_item(tenant_id, claims["sub"], source_id, body)
    return [n.to_doc() for n in nodes]


@router.get("/{content_id}", summary="Get a single content item")
async def get_content(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope("content:read")),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> dict[str, object]:
    node = await service.get_item(tenant_id, claims["sub"], content_id)
    return node.to_doc()


@router.get("", summary="List all content this client has pushed to this tenant")
async def list_content(
    claims: AccessTokenClaims = Depends(require_scope("content:read")),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> list[dict[str, object]]:
    nodes = await service.list_items(tenant_id, claims["sub"])
    return [n.to_doc() for n in nodes]


@router.get("-status/{content_id}", summary="Get ingestion status for a content item")
async def get_content_status(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope("content:read")),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> dict[str, str]:
    status = await service.get_status(tenant_id, claims["sub"], content_id)
    return {"status": status}


@router.patch("/{content_id}", summary="Update a content item's content")
async def update_content(
    content_id: str,
    body: PartnerContentUpdateRequest,
    claims: AccessTokenClaims = Depends(require_scope("content:write")),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> dict[str, object]:
    node = await service.update_item(tenant_id, claims["sub"], content_id, body)
    return node.to_doc()


@router.delete("/{content_id}", status_code=204, summary="Soft-delete a content item")
async def delete_content(
    content_id: str,
    claims: AccessTokenClaims = Depends(require_scope("content:delete")),
    tenant_id: str = Depends(get_tenant_id),
    service: PartnerContentService = Depends(get_partner_content_service),
) -> Response:
    await service.delete_item(tenant_id, claims["sub"], content_id)
    return Response(status_code=204)
