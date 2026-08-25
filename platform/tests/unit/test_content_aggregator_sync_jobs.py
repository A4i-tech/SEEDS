from __future__ import annotations

import pytest

from app.aggregators.sync_job_models import SyncItemResult
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.services import content_aggregator_sync_jobs as jobs
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repos():
    db = AsyncMongoMockClient()["test_seeds"]
    return ContentAggregatorSyncJobRepository(db), ContentAggregatorSyncJobItemRepository(db)


@pytest.mark.asyncio
async def test_serialize_job_maps_to_snake_case_shape(repos):
    job_repo, item_repo = repos
    job = await jobs.create_job(job_repo, tenant_id="tenant-a", source_type="subodha", scope="course", source_id="c1", total_items=1)
    await jobs.record_item_result(
        job_repo, item_repo, "tenant-a", job.job_id, SyncItemResult("c1", "Course One", "saved", None, "2026-08-06T00:00:00Z")
    )
    stored = await job_repo.get_job("tenant-a", job.job_id)
    stats = await item_repo.get_stats("tenant-a", job.job_id)

    serialized = jobs.serialize_job(stored, stats)

    assert serialized["job_id"] == job.job_id
    assert serialized["scope"] == "course"
    assert serialized["course_id"] == "c1"
    assert serialized["total_courses"] == 1
    assert serialized["processed"] == 1
    assert serialized["stats"]["saved"] == 1

    items = await item_repo.list_by_job("tenant-a", job.job_id)
    assert [i.source_id for i in items] == ["c1"]


@pytest.mark.asyncio
async def test_subscribe_replays_done_immediately_for_finished_job(repos):
    job_repo, item_repo = repos
    job = await jobs.create_job(job_repo, tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await jobs.finish_job(job_repo, item_repo, "tenant-a", job.job_id, "completed")
    events = [e async for e in jobs.subscribe(job_repo, item_repo, "tenant-a", job.job_id)]
    assert len(events) == 1
    assert events[0]["event"] == "done"


@pytest.mark.asyncio
async def test_subscribe_wrong_tenant_yields_nothing(repos):
    job_repo, item_repo = repos
    job = await jobs.create_job(job_repo, tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    events = [e async for e in jobs.subscribe(job_repo, item_repo, "tenant-b", job.job_id)]
    assert events == []


@pytest.mark.asyncio
async def test_set_total_broadcasts_progress(repos):
    job_repo, item_repo = repos
    job = await jobs.create_job(job_repo, tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await jobs.set_total(job_repo, item_repo, "tenant-a", job.job_id, 3)
    stored = await job_repo.get_job("tenant-a", job.job_id)
    assert stored.total_items == 3


@pytest.mark.asyncio
async def test_finish_job_sets_status(repos):
    job_repo, item_repo = repos
    job = await jobs.create_job(job_repo, tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await jobs.finish_job(job_repo, item_repo, "tenant-a", job.job_id, "failed", error="boom")
    stored = await job_repo.get_job("tenant-a", job.job_id)
    assert stored.status == "failed"
    assert stored.error == "boom"
