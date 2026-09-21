from __future__ import annotations

import pytest

from app.aggregators.sync_job_models import SyncItemResult, SyncStats
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.services import content_aggregator_sync_jobs as jobs
from app.services.content_aggregator_sync_jobs import SyncJobService
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorSyncJobRepository(client["test_seeds"])


@pytest.fixture
def item_repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorSyncJobItemRepository(client["test_seeds"])


@pytest.fixture
def service(repo, item_repo):
    return SyncJobService(repo, item_repo)


@pytest.mark.asyncio
async def test_serialize_job_maps_to_snake_case_shape(service, repo, item_repo):
    job = await service.create_job(tenant_id="tenant-a", source_type="subodha", scope="course", source_id="c1", total_items=1)
    await service.record_item_result("tenant-a", job.job_id, SyncItemResult("c1", "Course One", "saved", None, "2026-08-06T00:00:00Z"))
    stored = await repo.get_job("tenant-a", job.job_id)
    items = await item_repo.list_by_job("tenant-a", job.job_id)

    serialized = jobs.serialize_job(stored, SyncStats.from_items(items))

    assert serialized["job_id"] == job.job_id
    assert serialized["scope"] == "course"
    assert serialized["course_id"] == "c1"
    assert serialized["total_courses"] == 1
    assert serialized["processed"] == 1
    assert "items" not in serialized

    items = await item_repo.list_by_job("tenant-a", job.job_id)
    assert [i.source_id for i in items] == ["c1"]


@pytest.mark.asyncio
async def test_subscribe_replays_done_immediately_for_finished_job(service):
    job = await service.create_job(tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await service.finish_job("tenant-a", job.job_id, "completed")
    events = [e async for e in service.subscribe("tenant-a", job.job_id)]
    assert len(events) == 1
    assert events[0]["event"] == "done"


@pytest.mark.asyncio
async def test_subscribe_wrong_tenant_yields_nothing(service):
    job = await service.create_job(tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    events = [e async for e in service.subscribe("tenant-b", job.job_id)]
    assert events == []


@pytest.mark.asyncio
async def test_set_total_broadcasts_progress(service, repo):
    job = await service.create_job(tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await service.set_total("tenant-a", job.job_id, 3)
    stored = await repo.get_job("tenant-a", job.job_id)
    assert stored.total_items == 3


@pytest.mark.asyncio
async def test_subscribe_polls_for_progress_then_done(service, monkeypatch):
    monkeypatch.setattr(jobs, "POLL_INTERVAL_SECONDS", 0)
    job = await service.create_job(tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=2)
    job = await service.claim_next_pending_job("subodha")

    events = []

    async def _consume():
        async for event in service.subscribe("tenant-a", job.job_id):
            events.append(event)
            if len(events) == 1:
                await service.record_item_result(
                    "tenant-a", job.job_id,
                    SyncItemResult("c1", "Course One", "saved", None, "2026-08-06T00:00:00Z"),
                )
            elif len(events) == 2:
                await service.finish_job("tenant-a", job.job_id, "completed")

    await _consume()

    assert [e["event"] for e in events] == ["progress", "progress", "done"]


@pytest.mark.asyncio
async def test_finish_job_sets_status(service, repo):
    job = await service.create_job(tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await service.finish_job("tenant-a", job.job_id, "failed", error="boom")
    stored = await repo.get_job("tenant-a", job.job_id)
    assert stored.status == "failed"
    assert stored.error == "boom"
