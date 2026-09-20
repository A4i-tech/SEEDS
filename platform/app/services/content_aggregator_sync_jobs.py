from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

from app.aggregators.sync_job_models import SyncItemResult, SyncJob, SyncStats
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)

_subscribers: dict[str, list[asyncio.Queue]] = {}
POLL_INTERVAL_SECONDS = 1.0
TERMINAL_STATUSES = {"completed", "failed"}


def serialize_job(job: SyncJob, stats: SyncStats) -> dict[str, object]:
    processed = job.finished_total if job.status in TERMINAL_STATUSES and job.finished_total is not None else stats.total()
    return {
        "job_id": job.job_id,
        "scope": job.scope,
        "course_id": job.source_id,
        "status": job.status,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "total_courses": job.total_items,
        "processed": processed,
        "stats": stats.to_doc(),
        "error": job.error,
    }


async def create_job(
    repo: ContentAggregatorSyncJobRepository,
    *,
    tenant_id: str,
    source_type: str,
    scope: str,
    source_id: str | None,
    total_items: int,
    options: dict[str, object] | None = None,
) -> SyncJob:
    job_id = str(uuid.uuid4())
    return await repo.create_job(
        job_id, tenant_id=tenant_id, source_type=source_type, scope=scope, source_id=source_id,
        total_items=total_items, options=options or {},
    )


async def set_total(
    job_repo: ContentAggregatorSyncJobRepository,
    tenant_id: str,
    job_id: str,
    total: int,
) -> None:
    await job_repo.set_total_items(tenant_id, job_id, total)


async def record_item_result(
    item_repo: ContentAggregatorSyncJobItemRepository,
    tenant_id: str,
    job_id: str,
    entry: SyncItemResult,
) -> None:
    await item_repo.insert(tenant_id, job_id, entry)


async def has_active_all_sync(
    job_repo: ContentAggregatorSyncJobRepository,
    tenant_id: str,
    source_type: str,
) -> bool:
    active_jobs = await job_repo.get_active_jobs(tenant_id, source_type=source_type)
    return any(j.scope == "all" for j in active_jobs)


async def has_active_course_sync(
    job_repo: ContentAggregatorSyncJobRepository,
    tenant_id: str,
    source_type: str,
    course_id: str,
) -> bool:
    active_jobs = await job_repo.get_active_jobs(tenant_id, source_type=source_type)
    return any(j.scope == "course" and j.source_id == course_id for j in active_jobs)


async def get_job_status(
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    tenant_id: str,
    job_id: str,
) -> dict[str, object] | None:
    job = await job_repo.get_job(tenant_id, job_id)
    if job is None:
        return None
    stats = await item_repo.get_stats(tenant_id, job_id)
    return serialize_job(job, stats)


async def get_job_items_page(
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    tenant_id: str,
    job_id: str,
    *,
    limit: int,
    after: str | None,
) -> tuple[list[SyncItemResult], str | None, int] | None:
    job = await job_repo.get_job(tenant_id, job_id)
    if job is None:
        return None
    return await item_repo.list_by_job_page(tenant_id, job_id, limit=limit, after=after)


async def list_jobs_with_stats(
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    tenant_id: str,
    source_type: str,
    *,
    limit: int,
    scope: str | None = None,
    source_id: str | None = None,
) -> list[dict[str, object]]:
    job_list = await job_repo.list_jobs(tenant_id, source_type, limit=limit, scope=scope, source_id=source_id)
    payloads = []
    for j in job_list:
        stats = await item_repo.get_stats(tenant_id, j.job_id)
        payloads.append(serialize_job(j, stats))
    return payloads


async def get_active_jobs_with_stats(
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    tenant_id: str,
    source_type: str,
) -> list[dict[str, object]]:
    jobs = await job_repo.get_active_jobs(tenant_id, source_type)
    payloads = []
    for j in jobs:
        stats = await item_repo.get_stats(tenant_id, j.job_id)
        payloads.append(serialize_job(j, stats))
    return payloads


async def finish_job(
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    tenant_id: str,
    job_id: str,
    status: str,
    *,
    error: str | None = None,
) -> None:
    stats = await item_repo.get_stats(tenant_id, job_id)
    await job_repo.set_job_status(tenant_id, job_id, status, error=error, finished_total=stats.total())


async def subscribe(
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    tenant_id: str,
    job_id: str,
) -> AsyncIterator[dict[str, object]]:
    current = await job_repo.get_job(tenant_id, job_id)
    if current is None:
        return
    stats = await item_repo.get_stats(tenant_id, job_id)
    if current.status in TERMINAL_STATUSES:
        yield {"event": "done", "job": serialize_job(current, stats)}
        return
    yield {"event": "progress", "job": serialize_job(current, stats)}

    last_processed = stats.total()
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        current = await job_repo.get_job(tenant_id, job_id)
        if current is None:
            return
        stats = await item_repo.get_stats(tenant_id, job_id)
        if current.status in TERMINAL_STATUSES:
            yield {"event": "done", "job": serialize_job(current, stats)}
            return
        if stats.total() != last_processed:
            last_processed = stats.total()
            yield {"event": "progress", "job": serialize_job(current, stats)}
