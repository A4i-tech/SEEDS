from __future__ import annotations

import asyncio
import contextlib
import uuid
from collections.abc import AsyncIterator

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.models import SourceType
from app.aggregators.sync_job_models import (
    SyncItemResult,
    SyncJob,
    SyncJobStatus,
    SyncOptions,
    SyncScope,
    SyncStats,
)
from app.models.responses.content_aggregator import (
    SyncJobResponse,
    SyncStatsResponse,
    SyncStreamEvent,
)
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
    get_content_aggregator_sync_job_item_repo,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
    get_content_aggregator_sync_job_repo,
)

_subscribers: dict[str, list[asyncio.Queue]] = {}
POLL_INTERVAL_SECONDS = 1.0
TERMINAL_STATUSES = frozenset({SyncJobStatus.COMPLETED, SyncJobStatus.FAILED})


def serialize_job(job: SyncJob, stats: SyncStats) -> SyncJobResponse:
    processed = job.finished_total if job.status in TERMINAL_STATUSES and job.finished_total is not None else stats.total()
    return SyncJobResponse(
        job_id=job.job_id,
        source=job.source_type,
        scope=job.scope,
        course_id=job.source_id,
        status=job.status,
        started_at=job.started_at,
        finished_at=job.finished_at,
        total_courses=job.total_items,
        processed=processed,
        stats=SyncStatsResponse(**stats.to_doc()),
        error=job.error,
    )


def notify(job_id: str) -> None:
    for queue in _subscribers.get(job_id, []):
        if queue.empty():
            queue.put_nowait(None)


class SyncJobService:
    def __init__(
        self,
        job_repo: ContentAggregatorSyncJobRepository,
        item_repo: ContentAggregatorSyncJobItemRepository,
    ) -> None:
        self._job_repo = job_repo
        self._item_repo = item_repo

    async def create_job(
        self,
        *,
        tenant_id: str,
        source_type: SourceType,
        scope: SyncScope,
        source_id: str,
        total_items: int,
        options: SyncOptions,
    ) -> SyncJob:
        return await self._job_repo.create_job(
            str(uuid.uuid4()), tenant_id=tenant_id, source_type=source_type, scope=scope,
            source_id=source_id, total_items=total_items, options=options,
        )

    async def set_total(self, tenant_id: str, job_id: str, total: int) -> None:
        await self._job_repo.set_total_items(tenant_id, job_id, total)

    async def record_item_result(self, tenant_id: str, job_id: str, entry: SyncItemResult) -> None:
        await self._item_repo.insert(tenant_id, job_id, entry)
        notify(job_id)

    async def list_items(self, tenant_id: str, job_id: str) -> list[SyncItemResult]:
        return await self._item_repo.list_by_job(tenant_id, job_id)

    async def has_active_all_sync(self, tenant_id: str, source_type: SourceType) -> bool:
        active_jobs = await self._job_repo.get_active_jobs(tenant_id, source_type=source_type)
        return any(j.scope == SyncScope.ALL for j in active_jobs)

    async def has_active_course_sync(self, tenant_id: str, source_type: SourceType, course_id: str) -> bool:
        active_jobs = await self._job_repo.get_active_jobs(tenant_id, source_type=source_type)
        return any(j.scope == SyncScope.COURSE and j.source_id == course_id for j in active_jobs)

    async def _get_job(self, tenant_id: str, job_id: str) -> SyncJob:
        job = await self._job_repo.get_job(tenant_id, job_id)
        if job is None:
            raise NotFoundError("Job", job_id)
        return job

    async def get_job_status(self, tenant_id: str, job_id: str) -> SyncJobResponse:
        job = await self._get_job(tenant_id, job_id)
        stats = await self._item_repo.get_stats(tenant_id, job_id)
        return serialize_job(job, stats)

    async def get_job_items_page(
        self, tenant_id: str, job_id: str, *, limit: int, after: str
    ) -> tuple[list[SyncItemResult], str, int]:
        await self._get_job(tenant_id, job_id)
        return await self._item_repo.list_by_job_page(tenant_id, job_id, limit=limit, after=after)

    async def list_jobs_with_stats(
        self, tenant_id: str, source_type: SourceType | None, *, limit: int, scope: SyncScope | None = None, source_id: str = "",
    ) -> list[SyncJobResponse]:
        job_list = await self._job_repo.list_jobs(tenant_id, source_type, limit=limit, scope=scope, source_id=source_id)
        return [serialize_job(j, await self._item_repo.get_stats(tenant_id, j.job_id)) for j in job_list]

    async def get_active_jobs_with_stats(self, tenant_id: str, source_type: SourceType | None) -> list[SyncJobResponse]:
        jobs = await self._job_repo.get_active_jobs(tenant_id, source_type)
        return [serialize_job(j, await self._item_repo.get_stats(tenant_id, j.job_id)) for j in jobs]

    async def finish_job(self, tenant_id: str, job_id: str, status: SyncJobStatus, *, error: str = "") -> None:
        stats = await self._item_repo.get_stats(tenant_id, job_id)
        await self._job_repo.set_job_status(tenant_id, job_id, status, error=error, finished_total=stats.total())
        notify(job_id)

    async def claim_next_pending_job(self, source_type: SourceType) -> SyncJob | None:
        return await self._job_repo.claim_next_pending(source_type)

    async def reconcile_interrupted_jobs(self) -> int:
        return await self._job_repo.reconcile_interrupted_jobs()

    async def subscribe(self, tenant_id: str, job_id: str) -> AsyncIterator[SyncStreamEvent]:
        current = await self._job_repo.get_job(tenant_id, job_id)
        if current is None:
            return
        stats = await self._item_repo.get_stats(tenant_id, job_id)
        if current.status in TERMINAL_STATUSES:
            yield SyncStreamEvent(event="done", job=serialize_job(current, stats))
            return
        yield SyncStreamEvent(event="progress", job=serialize_job(current, stats))

        queue: asyncio.Queue = asyncio.Queue()
        _subscribers.setdefault(job_id, []).append(queue)
        try:
            last_processed = stats.total()
            while True:
                with contextlib.suppress(TimeoutError):
                    await asyncio.wait_for(queue.get(), timeout=POLL_INTERVAL_SECONDS)
                current = await self._job_repo.get_job(tenant_id, job_id)
                if current is None:
                    return
                stats = await self._item_repo.get_stats(tenant_id, job_id)
                if current.status in TERMINAL_STATUSES:
                    yield SyncStreamEvent(event="done", job=serialize_job(current, stats))
                    return
                if stats.total() != last_processed:
                    last_processed = stats.total()
                    yield SyncStreamEvent(event="progress", job=serialize_job(current, stats))
        finally:
            _subscribers[job_id].remove(queue)
            if not _subscribers[job_id]:
                del _subscribers[job_id]


def get_sync_job_service(db: AsyncDatabase = Depends(get_db)) -> SyncJobService:
    return SyncJobService(
        job_repo=get_content_aggregator_sync_job_repo(db),
        item_repo=get_content_aggregator_sync_job_item_repo(db),
    )
