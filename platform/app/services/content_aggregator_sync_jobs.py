"""Content aggregator sync job orchestration: id generation, persistence
writes, DB-polling pub/sub for SSE, and snake_case JSON serialization for
the /content-aggregators/* API. Job execution runs in a separate consumer
process, so SSE subscribers can't rely on in-process broadcast — they poll
the job document instead.
"""
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

POLL_INTERVAL_SECONDS = 1.0


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


async def create_job(
    repo: ContentAggregatorSyncJobRepository,
    *,
    tenant_id: str,
    source_type: str,
    scope: str,
    source_id: str | None,
    total_items: int,
    options: dict[str, object] = {},  # noqa: B006
) -> SyncJob:
    job_id = str(uuid.uuid4())
    return await repo.create_job(
        job_id, tenant_id=tenant_id, source_type=source_type, scope=scope, source_id=source_id,
        total_items=total_items, options=options,
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


async def finish_job(
    job_repo: ContentAggregatorSyncJobRepository,
    tenant_id: str,
    job_id: str,
    status: str,
    *,
    error: str | None = None,
) -> None:
    await job_repo.set_job_status(tenant_id, job_id, status, error=error)


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

    last_processed = stats.total()
    while True:
        await asyncio.sleep(POLL_INTERVAL_SECONDS)
        current = await job_repo.get_job(tenant_id, job_id)
        if current is None:
            return
        stats = await item_repo.get_stats(tenant_id, job_id)
        if current.status != "running":
            yield {"event": "done", "job": serialize_job(current, stats)}
            return
        if stats.total() != last_processed:
            last_processed = stats.total()
            yield {"event": "progress", "job": serialize_job(current, stats)}
