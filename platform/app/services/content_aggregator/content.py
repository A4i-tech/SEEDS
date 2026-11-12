from __future__ import annotations

from datetime import UTC, datetime

from app.models.requests.content_aggregator_content_requests import (
    Cursor,
    PartnerContentCreate,
    PartnerContentListQuery,
    PartnerContentUpdate,
)
from app.models.responses.content_aggregator import PartnerContentStatusResponse
from app.platform.error_handling import AppError, NotFoundError
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository

_JOB_STATUS_TO_PARTNER_STATUS = {
    "pending": "pending",
    "claimed": "pending",
    "running": "processing",
    "completed": "completed",
    "failed": "failed",
}


_IN_FLIGHT_JOB_STATUSES = ("pending", "claimed", "running")


def _content_key(doc: dict) -> str:
    return doc["content_id"]


def _parse_cursor(cursor: str | None) -> Cursor | None:
    if not cursor:
        return None
    raw_time, _, key = cursor.partition("_")
    if not raw_time.isdigit() or not key:
        raise AppError("INVALID_CURSOR", f"Malformed pagination cursor '{cursor}'", 400)
    return Cursor(int(raw_time), key)


class PartnerContentService:
    def __init__(
        self,
        partner_repo: ContentAggregatorRepository,
        content_repo: ContentRepository,
        job_repo: ContentJobRepository,
    ) -> None:
        self._partner_repo = partner_repo
        self._content_repo = content_repo
        self._job_repo = job_repo

    async def enqueue_content_job(self, tenant_id: str, content_id: str) -> str:
        return await self._job_repo.create(content_id, tenant_id=tenant_id, source="partner")

    async def create_item(
        self, tenant_id: str, client_id: str, content_id: str, body: PartnerContentCreate
    ) -> tuple[dict, bool]:
        now = datetime.now(UTC)
        doc = body.model_dump(exclude_none=True)
        doc.update(
            content_id=content_id,
            created_by=client_id,
            creation_time=int(now.timestamp()),
            is_deleted=False,
            is_processed=False,
            version="v3",
            created_at=now,
            updated_at=now,
        )
        return await self._partner_repo.insert_partner_content_if_absent(tenant_id, doc)

    async def record_job(self, tenant_id: str, content_id: str, job_id: str) -> None:
        await self._partner_repo.update_partner_content(tenant_id, content_id, {"job_id": job_id})

    async def update_item(
        self,
        tenant_id: str,
        content_id: str,
        body: PartnerContentUpdate,
        *,
        is_audio_uploaded: bool,
    ) -> dict:
        updates = body.model_dump(exclude_unset=True, exclude_none=True)
        job = await self._job_repo.find_latest_by_content_id(tenant_id, content_id)
        if job and job["status"] in _IN_FLIGHT_JOB_STATUSES:
            raise AppError(
                "CONTENT_PROCESSING", f"Content {content_id} is still being processed", 409
            )
        if is_audio_uploaded:
            updates["is_processed"] = False

        return await self._partner_repo.update_partner_content(tenant_id, content_id, updates)

    async def get_status(self, tenant_id: str, content_id: str) -> PartnerContentStatusResponse:
        await self.get_item(tenant_id, content_id)
        job = await self._job_repo.find_latest_by_content_id(tenant_id, content_id)
        if not job:
            raise NotFoundError("content job", content_id)
        return PartnerContentStatusResponse(
            status=_JOB_STATUS_TO_PARTNER_STATUS[job["status"]],
            attempted_at=job.get("started_at"),
            completed_at=job.get("completed_at"),
            failed_at=job.get("failed_at"),
            error=job.get("reason"),
        )

    async def delete_item(self, tenant_id: str, content_id: str) -> tuple[bool, int, int]:
        await self._partner_repo.find_partner_content(tenant_id, content_id)
        return await self._partner_repo.soft_delete_partner_content(
            tenant_id, content_id, datetime.now(UTC).isoformat()
        )

    async def get_item(self, tenant_id: str, content_id: str) -> dict:
        try:
            return await self._partner_repo.find_partner_content(tenant_id, content_id)
        except NotFoundError:
            doc = await self._content_repo.find_by_content_id(content_id, tenant_id)
            if not doc:
                raise
            return doc

    async def list_items(
        self,
        tenant_id: str,
        query: PartnerContentListQuery,
    ) -> tuple[list[dict], str | None, bool]:
        limit = query.limit
        filters = {
            **query.model_dump(exclude={"ids", "limit", "cursor"}),
            "content_ids": query.ids,
            "cursor": _parse_cursor(query.cursor),
            "limit": limit + 1,
        }
        own = await self._content_repo.search_content(tenant_id, **filters)
        partner = await self._partner_repo.search_partner_content(tenant_id, **filters)

        merged: dict[str, dict] = {}
        for doc in own:
            merged[_content_key(doc)] = doc
        for doc in partner:
            merged[_content_key(doc)] = doc

        items = sorted(
            merged.values(), key=lambda d: (-(d.get("creation_time") or 0), _content_key(d))
        )
        has_more = len(items) > limit
        items = items[:limit]
        next_cursor = (
            f"{items[-1]['creation_time']}_{_content_key(items[-1])}" if has_more else None
        )
        return items, next_cursor, has_more
