from __future__ import annotations

import pytest

from app.aggregators.sync_job_models import SyncItemResult
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorSyncJobItemRepository(client["test_seeds"])


@pytest.mark.asyncio
async def test_insert_and_list_by_job(repo):
    await repo.insert("tenant-a", "job-1", SyncItemResult("c1", "Course One", "saved", None, "2026-08-18T00:00:00Z"))
    await repo.insert("tenant-a", "job-1", SyncItemResult("c2", "Course Two", "failed", "boom", "2026-08-18T00:01:00Z"))

    items = await repo.list_by_job("tenant-a", "job-1")
    assert {i.source_id for i in items} == {"c1", "c2"}
    failed = next(i for i in items if i.source_id == "c2")
    assert failed.status == "failed"
    assert failed.error == "boom"


@pytest.mark.asyncio
async def test_list_by_job_isolated_between_jobs_and_tenants(repo):
    await repo.insert("tenant-a", "job-1", SyncItemResult("c1", "Course One", "saved", None, "x"))
    await repo.insert("tenant-a", "job-2", SyncItemResult("c2", "Course Two", "saved", None, "x"))
    await repo.insert("tenant-b", "job-1", SyncItemResult("c3", "Course Three", "saved", None, "x"))

    assert {i.source_id for i in await repo.list_by_job("tenant-a", "job-1")} == {"c1"}
    assert {i.source_id for i in await repo.list_by_job("tenant-a", "job-2")} == {"c2"}
    assert {i.source_id for i in await repo.list_by_job("tenant-b", "job-1")} == {"c3"}
