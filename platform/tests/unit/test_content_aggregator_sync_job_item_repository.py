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


@pytest.mark.asyncio
async def test_list_by_job_page_paginates_with_cursor(repo):
    for i in range(5):
        await repo.insert("tenant-a", "job-1", SyncItemResult(f"c{i}", f"Course {i}", "saved", None, "x"))

    page1, cursor1, total1 = await repo.list_by_job_page("tenant-a", "job-1", limit=2)
    assert [i.source_id for i in page1] == ["c0", "c1"]
    assert cursor1 is not None
    assert total1 == 5

    page2, cursor2, total2 = await repo.list_by_job_page("tenant-a", "job-1", limit=2, after=cursor1)
    assert [i.source_id for i in page2] == ["c2", "c3"]
    assert cursor2 is not None
    assert total2 == 5

    page3, cursor3, total3 = await repo.list_by_job_page("tenant-a", "job-1", limit=2, after=cursor2)
    assert [i.source_id for i in page3] == ["c4"]
    assert cursor3 is None
    assert total3 == 5


@pytest.mark.asyncio
async def test_list_by_job_page_isolated_between_jobs_and_tenants(repo):
    await repo.insert("tenant-a", "job-1", SyncItemResult("c1", "Course One", "saved", None, "x"))
    await repo.insert("tenant-a", "job-2", SyncItemResult("c2", "Course Two", "saved", None, "x"))
    await repo.insert("tenant-b", "job-1", SyncItemResult("c3", "Course Three", "saved", None, "x"))

    items, cursor, total = await repo.list_by_job_page("tenant-a", "job-1", limit=50)
    assert [i.source_id for i in items] == ["c1"]
    assert cursor is None
    assert total == 1


@pytest.mark.asyncio
async def test_get_stats_counts_by_status(repo):
    await repo.insert("tenant-a", "job-1", SyncItemResult("c1", "Course One", "saved", None, "x"))
    await repo.insert("tenant-a", "job-1", SyncItemResult("c2", "Course Two", "saved", None, "x"))
    await repo.insert("tenant-a", "job-1", SyncItemResult("c3", "Course Three", "skipped", None, "x"))
    await repo.insert("tenant-a", "job-1", SyncItemResult("c4", "Course Four", "failed", "boom", "x"))

    stats = await repo.get_stats("tenant-a", "job-1")
    assert stats.saved == 2
    assert stats.skipped == 1
    assert stats.empty == 0
    assert stats.failed == 1


@pytest.mark.asyncio
async def test_get_stats_isolated_between_tenants(repo):
    await repo.insert("tenant-a", "job-1", SyncItemResult("c1", "Course One", "saved", None, "x"))
    await repo.insert("tenant-b", "job-1", SyncItemResult("c2", "Course Two", "failed", "boom", "x"))

    stats = await repo.get_stats("tenant-a", "job-1")
    assert stats.saved == 1
    assert stats.failed == 0
