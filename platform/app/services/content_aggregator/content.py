from __future__ import annotations

from fastapi import Depends
from pydantic import TypeAdapter
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreate,
    PartnerContentListQuery,
    PartnerContentUpdate,
)
from app.models.requests.content_requests import ContentCreateRequest, ContentUpdateRequest
from app.models.responses.content import (
    AudioContent,
    ContentItem,
    ContentPageResponse,
    PaginationInfo,
)
from app.models.responses.content_aggregator import PartnerJobsResponse, PartnerJobStatusResponse
from app.models.responses.job import DeleteMatchedResponse
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.services.content_service import ContentService

_update_adapter = TypeAdapter(PartnerContentUpdate)


class PartnerContentService:
    def __init__(self, content_service: ContentService) -> None:
        self._content = content_service

    async def create(self, tenant_ids: list[str], body: PartnerContentCreate) -> PartnerJobsResponse:
        request = ContentCreateRequest.model_validate(body.model_dump())
        jobs: dict[str, str] = {}
        for tenant_id in tenant_ids:
            content_id = await self._content.create_content(request, tenant_id, "", None)
            jobs[tenant_id] = await self._content.enqueue_content_job(content_id)
        return PartnerJobsResponse(jobs=jobs)

    async def get(self, tenant_id: str, content_id: str) -> ContentItem:
        item = await self._content.get_content_by_id(content_id, tenant_id, None)
        if not item:
            raise NotFoundError("Content", content_id)
        return item

    async def list(self, tenant_id: str, query: PartnerContentListQuery) -> ContentPageResponse:
        if query.ids:
            data = await self._content.list_content_by_ids(query.ids, tenant_id, None)
            return ContentPageResponse(data=data, pagination=PaginationInfo(limit=len(data)))
        results = await self._content.list_content(
            tenant_id=tenant_id,
            school_id=None,
            language=query.language,
            theme=query.theme,
            exp_name=query.exp_name,
            only_teacher_app=query.only_teacher_app,
            cursor=query.cursor,
            limit=query.limit,
        )
        has_more = len(results) > query.limit
        data = results[: query.limit]
        next_cursor = f"{data[-1].creation_time}_{data[-1].id}" if has_more else None
        return ContentPageResponse(
            data=data,
            pagination=PaginationInfo(next_cursor=next_cursor, has_more=has_more, limit=query.limit),
        )

    async def update(
        self, tenant_id: str, content_id: str, body: PartnerContentUpdate, is_audio_uploaded: bool
    ) -> ContentItem:
        request = ContentUpdateRequest.model_validate({"id": content_id, **_update_adapter.dump_python(body)})
        item = await self._content.update_content(request, tenant_id, None, is_audio_uploaded)
        if not item:
            raise NotFoundError("Content", content_id)
        if is_audio_uploaded and isinstance(item, AudioContent):
            item.job_id = await self._content.enqueue_content_job(item.id)
        return item

    async def delete(self, tenant_id: str, content_id: str) -> DeleteMatchedResponse:
        matched = await self._content.delete_content(content_id, tenant_id, None)
        if not matched:
            raise NotFoundError("Content", content_id)
        return DeleteMatchedResponse(matched=matched)

    async def get_job_status(self, tenant_id: str, job_id: str) -> PartnerJobStatusResponse:
        job = await self._content.get_job(job_id)
        if not job:
            raise NotFoundError("Job", job_id)
        await self.get(tenant_id, job["content_id"])
        return PartnerJobStatusResponse(
            job_id=job_id,
            status=job["status"],
            content_id=job["content_id"],
            created_at=job["created_at"],
            reason=job.get("reason", ""),
        )


def get_partner_content_service(db: AsyncDatabase = Depends(get_db)) -> PartnerContentService:
    return PartnerContentService(ContentService(db))
