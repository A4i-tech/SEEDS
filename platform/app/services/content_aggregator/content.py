from __future__ import annotations

import urllib.parse
import uuid
from datetime import UTC, datetime

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
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_job_repository import ContentJobRepository

_update_adapter = TypeAdapter(PartnerContentUpdate)


class PartnerContentService:
    def __init__(self, aggregator_repo: ContentAggregatorRepository, job_repo: ContentJobRepository) -> None:
        self._aggregator_repo = aggregator_repo
        self._job_repo = job_repo

    async def create(self, tenant_ids: list[str], client_name: str, body: PartnerContentCreate) -> PartnerJobsResponse:
        now = datetime.now(UTC)
        jobs: dict[str, str] = {}
        for tenant_id in tenant_ids:
            content_id = str(uuid.uuid4())
            await self._aggregator_repo.insert_partner_content(
                body.model_dump()
                | {
                    "tenant_id": tenant_id,
                    "content_id": content_id,
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
        return Content.from_mongo(await self._aggregator_repo.find_partner_content(tenant_id, content_id))

    async def list(self, tenant_id: str, query: PartnerContentListQuery) -> PartnerContentPageResponse:
        filters = {
            "language": query.language,
            "theme.english": urllib.parse.unquote(query.theme),
            "type": query.exp_name.lower(),
            "is_teacher_app": query.only_teacher_app,
            "content_id": query.ids and {"$in": query.ids},
        }
        docs = await self._aggregator_repo.search_partner_content(tenant_id, filters, query.cursor, query.limit + 1)
        has_more = len(docs) > query.limit
        data = [Content.from_mongo(doc) for doc in docs[: query.limit]]
        next_cursor = f"{data[-1].creation_time}_{data[-1].content_id}" if has_more else None
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
        doc = await self._aggregator_repo.update_partner_content(tenant_id, content_id, updates)
        job_id = await self._job_repo.create(content_id, tenant_id, client_name) if is_audio_uploaded else ""
        return PartnerContentUpdateResponse(**Content.from_mongo(doc).model_dump(), job_id=job_id)

    async def delete(self, tenant_id: str, content_id: str) -> DeleteMatchedResponse:
        return DeleteMatchedResponse(
            matched=await self._aggregator_repo.soft_delete_partner_content(tenant_id, content_id)
        )

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
    return PartnerContentService(ContentAggregatorRepository(db), ContentJobRepository(db))
