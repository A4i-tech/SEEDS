from __future__ import annotations

import urllib.parse
from datetime import UTC, datetime

from bson import ObjectId
from fastapi import Depends
from pydantic import TypeAdapter
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content import Content
from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreate,
    PartnerContentListQuery,
    PartnerContentUpdate,
)
from app.models.responses.content import PaginationInfo
from app.models.responses.content_aggregator import (
    PartnerContentPageResponse,
    PartnerContentUpdateResponse,
    PartnerJobsResponse,
    PartnerJobStatusResponse,
)
from app.models.responses.job import DeleteMatchedResponse
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository

_update_adapter = TypeAdapter(PartnerContentUpdate)


class PartnerContentService:
    def __init__(self, content_repo: ContentRepository, job_repo: ContentJobRepository) -> None:
        self._content_repo = content_repo
        self._job_repo = job_repo

    async def create(self, tenant_ids: list[str], client_name: str, body: PartnerContentCreate) -> PartnerJobsResponse:
        now = datetime.now(UTC)
        jobs: dict[str, str] = {}
        for tenant_id in tenant_ids:
            content_id = await self._content_repo.insert_partner_content(
                body.model_dump()
                | {
                    "tenant_id": ObjectId(tenant_id),
                    "school_id": None,
                    "created_by": client_name,
                    "creation_time": int(now.timestamp()),
                    "is_deleted": False,
                    "is_processed": False,
                    "version": "v3",
                    "created_at": now,
                    "updated_at": now,
                }
            )
            jobs[tenant_id] = await self._job_repo.create(content_id, tenant_id, client_name)
        return PartnerJobsResponse(jobs=jobs)

    async def get(self, tenant_id: str, content_id: str) -> Content:
        doc = await self._content_repo.find_by_id_and_tenant(content_id, tenant_id)
        if not doc:
            raise NotFoundError("Content", content_id)
        return Content.from_mongo(doc)

    async def list(self, tenant_id: str, query: PartnerContentListQuery) -> PartnerContentPageResponse:
        filters = {
            "language": query.language,
            "theme.english": urllib.parse.unquote(query.theme),
            "type": query.exp_name.lower(),
            "is_teacher_app": query.only_teacher_app,
            "_id": query.ids and {"$in": [ObjectId(i) for i in query.ids]},
        }
        docs = await self._content_repo.list_partner_content(tenant_id, filters, query.cursor, query.limit + 1)
        has_more = len(docs) > query.limit
        data = [Content.from_mongo(doc) for doc in docs[: query.limit]]
        next_cursor = f"{data[-1].creation_time}_{data[-1].id}" if has_more else None
        return PartnerContentPageResponse(
            data=data,
            pagination=PaginationInfo(next_cursor=next_cursor, has_more=has_more, limit=query.limit),
        )

    async def update(
        self,
        tenant_id: str,
        client_name: str,
        content_id: str,
        body: PartnerContentUpdate,
        is_audio_uploaded: bool,
    ) -> PartnerContentUpdateResponse:
        updates = _update_adapter.dump_python(body) | ({"is_processed": False} if is_audio_uploaded else {})
        doc = await self._content_repo.update_by_id_and_tenant(content_id, tenant_id, updates)
        if not doc:
            raise NotFoundError("Content", content_id)
        job_id = await self._job_repo.create(content_id, tenant_id, client_name) if is_audio_uploaded else ""
        return PartnerContentUpdateResponse(**Content.from_mongo(doc).model_dump(), job_id=job_id)

    async def delete(self, tenant_id: str, content_id: str) -> DeleteMatchedResponse:
        matched = await self._content_repo.soft_delete_by_id_and_tenant(content_id, tenant_id)
        if not matched:
            raise NotFoundError("Content", content_id)
        return DeleteMatchedResponse(matched=matched)

    async def get_job_status(self, tenant_id: str, job_id: str) -> PartnerJobStatusResponse:
        job = await self._job_repo.find_by_id(job_id)
        if not job or job.get("tenant_id") != tenant_id:
            raise NotFoundError("Job", job_id)
        return PartnerJobStatusResponse(
            job_id=job_id,
            status=job["status"],
            content_id=job["content_id"],
            created_at=job["created_at"],
            reason=job.get("reason", ""),
        )


def get_partner_content_service(db: AsyncDatabase = Depends(get_db)) -> PartnerContentService:
    return PartnerContentService(ContentRepository(db), ContentJobRepository(db))
