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


def _entry(source_id: str, status: str = "saved") -> SyncItemResult:
    return SyncItemResult(source_id=source_id, name=source_id, status=status, error=None, at="2026-08-06T00:00:00Z")


@pytest.mark.asyncio
async def test_insert_and_list_by_job(repo):
    await repo.insert("tenant-a", "job-1", _entry("c1"))
    await repo.insert("tenant-a", "job-1", _entry("c2"))
    await repo.insert("tenant-a", "job-2", _entry("c3"))

    items = await repo.list_by_job("tenant-a", "job-1")
    assert {i.source_id for i in items} == {"c1", "c2"}


@pytest.mark.asyncio
async def test_list_by_job_isolated_between_tenants(repo):
    await repo.insert("tenant-a", "job-1", _entry("c1"))
    items = await repo.list_by_job("tenant-b", "job-1")
    assert items == []


@pytest.mark.asyncio
async def test_list_by_job_page_paginates_with_cursor(repo):
    for i in range(3):
        await repo.insert("tenant-a", "job-1", _entry(f"c{i}"))

    page1, cursor1, total = await repo.list_by_job_page("tenant-a", "job-1", limit=2)
    assert len(page1) == 2
    assert total == 3
    assert cursor1 is not None

    page2, cursor2, total = await repo.list_by_job_page("tenant-a", "job-1", limit=2, after=cursor1)
    assert len(page2) == 1
    assert cursor2 is None
    assert total == 3


@pytest.mark.asyncio
async def test_get_stats_counts_by_status(repo):
    await repo.insert("tenant-a", "job-1", _entry("c1", "saved"))
    await repo.insert("tenant-a", "job-1", _entry("c2", "saved"))
    await repo.insert("tenant-a", "job-1", _entry("c3", "failed"))
    await repo.insert("tenant-a", "job-1", _entry("c4", "skipped"))
    await repo.insert("tenant-a", "job-1", _entry("c5", "empty"))

    stats = await repo.get_stats("tenant-a", "job-1")
    assert stats.saved == 2
    assert stats.failed == 1
    assert stats.skipped == 1
    assert stats.empty == 1
