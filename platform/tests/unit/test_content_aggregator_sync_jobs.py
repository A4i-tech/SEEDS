from __future__ import annotations

import pytest

from app.aggregators.sync_job_models import SyncItemResult
from app.repositories.content_aggregator_sync_job_repository import ContentAggregatorSyncJobRepository
from app.services import content_aggregator_sync_jobs as jobs
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorSyncJobRepository(client["test_seeds"])


@pytest.mark.asyncio
async def test_serialize_job_maps_to_snake_case_shape(repo):
    job = await jobs.create_job(repo, tenant_id="tenant-a", source_type="subodha", scope="course", source_id="c1", total_items=1)
    await jobs.record_item_result(repo, "tenant-a", job.job_id, SyncItemResult("c1", "Course One", "saved", None, "2026-08-06T00:00:00Z"))
    stored = await repo.get_job("tenant-a", job.job_id)

    serialized = jobs.serialize_job(stored)

    assert serialized["job_id"] == job.job_id
    assert serialized["scope"] == "course"
    assert serialized["course_id"] == "c1"
    assert serialized["total_courses"] == 1
    assert serialized["processed"] == 1
    assert serialized["items"] == [{"source_id": "c1", "name": "Course One", "status": "saved", "error": None, "at": "2026-08-06T00:00:00Z"}]


@pytest.mark.asyncio
async def test_subscribe_replays_done_immediately_for_finished_job(repo):
    job = await jobs.create_job(repo, tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await jobs.finish_job(repo, "tenant-a", job.job_id, "completed")
    events = [e async for e in jobs.subscribe(repo, "tenant-a", job.job_id)]
    assert len(events) == 1
    assert events[0]["event"] == "done"


@pytest.mark.asyncio
async def test_subscribe_wrong_tenant_yields_nothing(repo):
    job = await jobs.create_job(repo, tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    events = [e async for e in jobs.subscribe(repo, "tenant-b", job.job_id)]
    assert events == []


@pytest.mark.asyncio
async def test_set_total_broadcasts_progress(repo):
    job = await jobs.create_job(repo, tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await jobs.set_total(repo, "tenant-a", job.job_id, 3)
    stored = await repo.get_job("tenant-a", job.job_id)
    assert stored.total_items == 3


@pytest.mark.asyncio
async def test_finish_job_sets_status(repo):
    job = await jobs.create_job(repo, tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await jobs.finish_job(repo, "tenant-a", job.job_id, "failed", error="boom")
    stored = await repo.get_job("tenant-a", job.job_id)
    assert stored.status == "failed"
    assert stored.error == "boom"
