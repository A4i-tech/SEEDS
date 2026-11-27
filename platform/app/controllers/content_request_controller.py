from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query

from app.models.content import Content
from app.models.content_aggregator import PartnerAccess
from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreate,
    PartnerContentListQuery,
    PartnerContentUpdate,
)
from app.models.requests.integration_headers import IdempotencyKey
from app.models.responses.content import QuizContent
from app.models.responses.content_aggregator import (
    PartnerContentPageResponse,
    PartnerContentUpdateResponse,
    PartnerDeleteResponse,
    PartnerJobsResponse,
    PartnerJobStatusResponse,
)
from app.platform.auth.partner import require_partner
from app.services.content_aggregator_content_service import (
    ContentAggregatorContentService,
    get_content_aggregator_content_service,
)

router = APIRouter(prefix="/v1/content", tags=["Content Aggregator Content"])


@router.post("", summary="Push a single piece of content to one or more tenants")
async def create_content(
    body: PartnerContentCreate,
    idempotency_key: Annotated[IdempotencyKey, Header(alias="Idempotency-Key")],
    access: PartnerAccess = Depends(require_partner("content:write", single=False)),
    service: ContentAggregatorContentService = Depends(get_content_aggregator_content_service),
) -> PartnerJobsResponse:
    return await service.create(access.tenant_ids, access.client_id, idempotency_key, body)


@router.get("/job/{job_id}", summary="Get ingestion status for a job")
async def get_job_status(
    job_id: str,
    access: PartnerAccess = Depends(require_partner("content:read")),
    service: ContentAggregatorContentService = Depends(get_content_aggregator_content_service),
) -> PartnerJobStatusResponse:
    return await service.get_job_status(access.tenant_ids[0], access.client_id, job_id)


@router.get("/{content_id}", summary="Get a single content item", response_model_exclude_none=True)
async def get_content(
    content_id: str,
    access: PartnerAccess = Depends(require_partner("content:read")),
    service: ContentAggregatorContentService = Depends(get_content_aggregator_content_service),
) -> Content | QuizContent:
    return await service.get(access.tenant_ids[0], content_id)


@router.get("", summary="List content for this tenant", response_model_exclude_none=True)
async def list_content(
    query: Annotated[PartnerContentListQuery, Query()],
    access: PartnerAccess = Depends(require_partner("content:read")),
    service: ContentAggregatorContentService = Depends(get_content_aggregator_content_service),
) -> PartnerContentPageResponse:
    return await service.list(access.tenant_ids[0], query)


@router.patch("/{content_id}", summary="Update a content item", response_model_exclude_none=True)
async def update_content(
    content_id: str,
    body: PartnerContentUpdate,
    access: PartnerAccess = Depends(require_partner("content:write")),
    service: ContentAggregatorContentService = Depends(get_content_aggregator_content_service),
) -> PartnerContentUpdateResponse | QuizContent:
    return await service.update(access.tenant_ids[0], access.client_id, content_id, body)


@router.delete("/{content_id}", summary="Soft-delete a content item")
async def delete_content(
    content_id: str,
    access: PartnerAccess = Depends(require_partner("content:delete")),
    service: ContentAggregatorContentService = Depends(get_content_aggregator_content_service),
) -> PartnerDeleteResponse:
    return await service.delete(access.tenant_ids[0], access.client_id, content_id)
