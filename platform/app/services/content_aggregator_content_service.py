from __future__ import annotations

import hashlib
import logging
import urllib.parse
from datetime import UTC, datetime

from bson import ObjectId
from fastapi import Depends
from pydantic import TypeAdapter
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content import Content
from app.models.content_aggregator import ContentRequest
from app.models.requests.content_aggregator_content_requests import (
    PartnerContentCreate,
    PartnerContentListQuery,
    PartnerContentUpdate,
)
from app.models.requests.integration_headers import IdempotencyKey
from app.models.responses.content import PaginationInfo, QuizContent
from app.models.responses.content_aggregator import (
    PartnerContentPageResponse,
    PartnerContentUpdateResponse,
    PartnerDeleteResponse,
    PartnerJobsResponse,
    PartnerJobStatusResponse,
)
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import AppError, NotFoundError
from app.platform.logging import request_id_ctx_var
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository
from app.repositories.content_request_repository import ContentRequestRepository
from app.repositories.integration_client_repository import IntegrationClientRepository
from app.repositories.quiz_repository import QuizRepository

logger = logging.getLogger(__name__)

_update_adapter = TypeAdapter(PartnerContentUpdate)
_QUIZ_ONLY_FIELDS = frozenset({"positive_marks", "negative_marks", "questions"})
_AUDIO_ONLY_FIELDS = frozenset({"audio_content", "description"})


class ContentAggregatorContentService:
    def __init__(
        self,
        content_repo: ContentRepository,
        job_repo: ContentJobRepository,
        client_repo: IntegrationClientRepository,
        quiz_repo: QuizRepository,
        request_repo: ContentRequestRepository,
    ) -> None:
        self._content_repo = content_repo
        self._job_repo = job_repo
        self._client_repo = client_repo
        self._quiz_repo = quiz_repo
        self._request_repo = request_repo

    async def create(
        self, tenant_ids: list[str], client_id: str, key: IdempotencyKey, body: PartnerContentCreate
    ) -> PartnerJobsResponse:
        owner_id = await self._client_repo.find_object_id(client_id)
        now = datetime.now(UTC)
        payload_hash = hashlib.sha256(body.model_dump_json().encode()).hexdigest()
        jobs: dict[str, str] = {}
        for tenant_id in tenant_ids:
            tenant_oid = ObjectId(tenant_id)
            if await self._request_repo.claim(tenant_oid, client_id, key, payload_hash):
                doc = body.model_dump() | {
                    "tenant_id": tenant_oid,
                    "school_id": None,
                    "created_by": owner_id,
                    "creation_time": int(now.timestamp()),
                    "is_deleted": False,
                    "created_at": now,
                    "updated_at": now,
                }
                if body.type == "quiz":
                    content_id = await self._quiz_repo.insert(doc)
                    job_id = await self._job_repo.create(content_id, "completed")
                else:
                    content_id = await self._content_repo.insert_partner_content(
                        doc | {"is_processed": False, "version": "v3"}
                    )
                    job_id = await self._job_repo.create(content_id)
                await self._request_repo.set_result(tenant_oid, client_id, key, content_id, job_id)
                jobs[tenant_id] = job_id
                logger.info(
                    "content_aggregator: accepted request_id=%s client_id=%s tenant_id=%s idempotency_key=%s type=%s",
                    request_id_ctx_var.get(""), client_id, tenant_id, key, body.type,
                )
            else:
                request = ContentRequest.model_validate(await self._request_repo.find(tenant_oid, client_id, key))
                if request.payload_hash != payload_hash or not request.job_id:
                    raise AppError(
                        "IDEMPOTENCY_CONFLICT",
                        f"Idempotency-Key reused with a different payload (request {request.id})",
                        409,
                    )
                jobs[tenant_id] = request.job_id
                logger.info(
                    "content_aggregator: idempotent replay request_id=%s client_id=%s tenant_id=%s idempotency_key=%s type=%s",
                    request_id_ctx_var.get(""), client_id, tenant_id, key, body.type,
                )
        return PartnerJobsResponse(jobs=jobs)

    async def get(self, tenant_id: str, content_id: str) -> Content | QuizContent:
        doc = await self._content_repo.find_by_id_and_tenant(content_id, tenant_id)
        if doc:
            return Content.from_mongo(doc)
        quiz = await self._quiz_repo.find_by_id_and_tenant(content_id, tenant_id)
        if not quiz:
            raise NotFoundError("Content", content_id)
        return QuizContent.from_doc(quiz)

    async def list(self, tenant_id: str, query: PartnerContentListQuery) -> PartnerContentPageResponse:
        is_quiz = query.exp_name.lower() == "quiz"
        repo = self._quiz_repo if is_quiz else self._content_repo
        parse = QuizContent.from_doc if is_quiz else Content.from_mongo
        filters = {
            "language": query.language,
            "theme.english": urllib.parse.unquote(query.theme),
            "is_teacher_app": query.only_teacher_app,
            "_id": query.ids and {"$in": [ObjectId(i) for i in query.ids]},
        } | ({} if is_quiz else {"type": query.exp_name.lower()})
        docs = await repo.list_partner_content(tenant_id, filters, query.cursor, query.limit + 1)
        has_more = len(docs) > query.limit
        data = [parse(doc) for doc in docs[: query.limit]]
        next_cursor = f"{data[-1].creation_time}_{data[-1].id}" if has_more else None
        return PartnerContentPageResponse(
            data=data,
            pagination=PaginationInfo(next_cursor=next_cursor, has_more=has_more, limit=query.limit),
        )

    async def update(
        self,
        tenant_id: str,
        client_id: str,
        content_id: str,
        body: PartnerContentUpdate,
    ) -> PartnerContentUpdateResponse | QuizContent:
        owner_id = await self._client_repo.find_object_id(client_id)
        fields = _update_adapter.dump_python(body)
        has_audio = "audio_content" in fields
        current = await self._content_repo.find_by_id_and_tenant(content_id, tenant_id)
        if current and current["created_by"] == owner_id and await self._job_repo.has_open_job(content_id):
            raise AppError("JOB_IN_PROGRESS", "content is being processed, retry when the job finishes", 409)
        updates = {k: v for k, v in fields.items() if k not in _QUIZ_ONLY_FIELDS} | (
            {"is_processed": False} if has_audio else {}
        )
        doc = await self._content_repo.update_by_id_and_tenant(content_id, tenant_id, owner_id, updates)
        if doc:
            job_id = await self._job_repo.create(content_id) if has_audio else ""
            return PartnerContentUpdateResponse(**Content.from_mongo(doc).model_dump(), job_id=job_id)
        quiz = await self._quiz_repo.update_by_id_and_tenant(
            content_id, tenant_id, owner_id, {k: v for k, v in fields.items() if k not in _AUDIO_ONLY_FIELDS}
        )
        if not quiz:
            raise NotFoundError("Content", content_id)
        return QuizContent.from_doc(quiz)

    async def delete(self, tenant_id: str, client_id: str, content_id: str) -> PartnerDeleteResponse:
        owner_id = await self._client_repo.find_object_id(client_id)
        matched = await self._content_repo.soft_delete_by_id_and_tenant(
            content_id, tenant_id, owner_id
        ) or await self._quiz_repo.soft_delete_by_id_and_tenant(content_id, tenant_id, owner_id)
        if not matched:
            raise NotFoundError("Content", content_id)
        await self._job_repo.cancel_pending(content_id)
        return PartnerDeleteResponse(acknowledged=True, matched_count=matched, modified_count=matched)

    async def get_job_status(self, tenant_id: str, client_id: str, job_id: str) -> PartnerJobStatusResponse:
        owner_id = await self._client_repo.find_object_id(client_id)
        job = await self._job_repo.find_by_id(job_id)
        if not job:
            raise NotFoundError("Job", job_id)
        content = await self._content_repo.find_raw_by_id(job["content_id"]) or await self._quiz_repo.find_raw_by_id(
            job["content_id"]
        )
        if not content or content["tenant_id"] != ObjectId(tenant_id) or content["created_by"] != owner_id:
            raise NotFoundError("Job", job_id)
        return PartnerJobStatusResponse(
            job_id=job_id,
            status=job["status"],
            content_id=job["content_id"],
            created_at=job["created_at"],
            reason=job.get("reason", ""),
        )


def get_content_aggregator_content_service(db: AsyncDatabase = Depends(get_db)) -> ContentAggregatorContentService:
    return ContentAggregatorContentService(
        ContentRepository(db),
        ContentJobRepository(db),
        IntegrationClientRepository(db),
        QuizRepository(db),
        ContentRequestRepository(db),
    )
