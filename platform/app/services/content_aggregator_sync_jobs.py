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


def serialize_job(job: SyncJob, stats: SyncStats) -> dict[str, object]:
    return {
        "job_id": job.job_id,
        "scope": job.scope,
        "course_id": job.source_id,
        "status": job.status,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "total_courses": job.total_items,
        "processed": stats.total(),
        "stats": stats.to_doc(),
        "error": job.error,
    }


def _broadcast(job_id: str, event: dict[str, object]) -> None:
    for queue in _subscribers.get(job_id, []):
        queue.put_nowait(event)


async def create_job(
    repo: ContentAggregatorSyncJobRepository, *, tenant_id: str, source_type: str, scope: str, source_id: str | None, total_items: int
) -> SyncJob:
    job_id = str(uuid.uuid4())
    return await repo.create_job(
        job_id, tenant_id=tenant_id, source_type=source_type, scope=scope, source_id=source_id, total_items=total_items
    )


async def set_total(
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    tenant_id: str,
    job_id: str,
    total: int,
) -> None:
    job = await job_repo.set_total_items(tenant_id, job_id, total)
    if job is not None:
        stats = await item_repo.get_stats(tenant_id, job_id)
        _broadcast(job_id, {"event": "progress", "job": serialize_job(job, stats)})


async def record_item_result(
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    tenant_id: str,
    job_id: str,
    entry: SyncItemResult,
) -> None:
    await item_repo.insert(tenant_id, job_id, entry)
    if _subscribers.get(job_id):
        job = await job_repo.get_job(tenant_id, job_id)
        if job is not None:
            stats = await item_repo.get_stats(tenant_id, job_id)
            _broadcast(job_id, {"event": "progress", "job": serialize_job(job, stats)})


async def finish_job(
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    tenant_id: str,
    job_id: str,
    status: str,
    *,
    error: str | None = None,
) -> None:
    job = await job_repo.set_job_status(tenant_id, job_id, status, error=error)
    if job is not None:
        stats = await item_repo.get_stats(tenant_id, job_id)
        _broadcast(job_id, {"event": "done", "job": serialize_job(job, stats)})
    _subscribers.pop(job_id, None)


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
    if current.status != "running":
        yield {"event": "done", "job": serialize_job(current, stats)}
        return
    yield {"event": "progress", "job": serialize_job(current, stats)}

    queue: asyncio.Queue = asyncio.Queue()
    subs = _subscribers.setdefault(job_id, [])
    subs.append(queue)
    try:
        current = await job_repo.get_job(tenant_id, job_id)
        if current is not None and current.status != "running":
            stats = await item_repo.get_stats(tenant_id, job_id)
            yield {"event": "done", "job": serialize_job(current, stats)}
            return
        while True:
            event = await queue.get()
            yield event
            if event["event"] == "done":
                break
    finally:
        if queue in subs:
            subs.remove(queue)
