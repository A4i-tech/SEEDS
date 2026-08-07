"""Content aggregator sync job orchestration: id generation, persistence
writes, in-process pub/sub for SSE, and snake_case JSON serialization for
the /content-aggregators/* API.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator

from app.aggregators.sync_job_models import SyncItemResult, SyncJob
from app.repositories.content_aggregator_sync_job_repository import ContentAggregatorSyncJobRepository

_subscribers: dict[str, list[asyncio.Queue]] = {}


def serialize_job(job: SyncJob) -> dict[str, object]:
    return {
        "job_id": job.job_id,
        "scope": job.scope,
        "course_id": job.source_id,
        "status": job.status,
        "started_at": job.started_at,
        "finished_at": job.finished_at,
        "total_courses": job.total_items,
        "processed": job.processed,
        "stats": job.stats.to_doc(),
        "items": [i.to_doc() for i in job.items],
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


async def set_total(repo: ContentAggregatorSyncJobRepository, tenant_id: str, job_id: str, total: int) -> None:
    job = await repo.set_total_items(tenant_id, job_id, total)
    if job is not None:
        _broadcast(job_id, {"event": "progress", "job": serialize_job(job)})


async def record_item_result(repo: ContentAggregatorSyncJobRepository, tenant_id: str, job_id: str, entry: SyncItemResult) -> None:
    job = await repo.append_item_result(tenant_id, job_id, entry)
    if job is not None:
        _broadcast(job_id, {"event": "progress", "job": serialize_job(job)})


async def finish_job(
    repo: ContentAggregatorSyncJobRepository, tenant_id: str, job_id: str, status: str, *, error: str | None = None
) -> None:
    job = await repo.set_job_status(tenant_id, job_id, status, error=error)
    if job is not None:
        _broadcast(job_id, {"event": "done", "job": serialize_job(job)})
    _subscribers.pop(job_id, None)


async def subscribe(repo: ContentAggregatorSyncJobRepository, tenant_id: str, job_id: str) -> AsyncIterator[dict[str, object]]:
    current = await repo.get_job(tenant_id, job_id)
    if current is None:
        return
    if current.status != "running":
        yield {"event": "done", "job": serialize_job(current)}
        return
    yield {"event": "progress", "job": serialize_job(current)}

    queue: asyncio.Queue = asyncio.Queue()
    subs = _subscribers.setdefault(job_id, [])
    subs.append(queue)
    try:
        current = await repo.get_job(tenant_id, job_id)
        if current is not None and current.status != "running":
            yield {"event": "done", "job": serialize_job(current)}
            return
        while True:
            event = await queue.get()
            yield event
            if event["event"] == "done":
                break
    finally:
        if queue in subs:
            subs.remove(queue)
