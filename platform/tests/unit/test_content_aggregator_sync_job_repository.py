from __future__ import annotations

import pytest

from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorSyncJobRepository(client["test_seeds"])


@pytest.mark.asyncio
async def test_create_and_get_job(repo):
    job = await repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    assert job.status == "pending"
    assert job.source_type == "subodha"
    assert job.created_at is not None
    assert job.started_at is None

    fetched = await repo.get_job("tenant-a", "job-1")
    assert fetched.job_id == "job-1"


@pytest.mark.asyncio
async def test_set_total_items(repo):
    await repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    job = await repo.set_total_items("tenant-a", "job-1", 5)
    assert job.total_items == 5


@pytest.mark.asyncio
async def test_set_job_status(repo):
    await repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    job = await repo.set_job_status("tenant-a", "job-1", "completed")
    assert job.status == "completed"
    assert job.finished_at is not None


@pytest.mark.asyncio
async def test_jobs_are_isolated_between_tenants(repo):
    await repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    assert await repo.get_job("tenant-b", "job-1") is None


@pytest.mark.asyncio
async def test_list_jobs_filters_by_source_type(repo):
    await repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await repo.create_job("job-2", tenant_id="tenant-a", source_type="hexis", scope="all", source_id=None, total_items=0)
    jobs = await repo.list_jobs("tenant-a", "subodha")
    assert {j.job_id for j in jobs} == {"job-1"}


@pytest.mark.asyncio
async def test_get_active_jobs(repo):
    await repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await repo.create_job("job-2", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await repo.set_job_status("tenant-a", "job-2", "completed")
    active = await repo.get_active_jobs("tenant-a", "subodha")
    assert {j.job_id for j in active} == {"job-1"}


@pytest.mark.asyncio
async def test_reconcile_interrupted_jobs_leaves_pending_jobs_untouched(repo):
    await repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    reconciled = await repo.reconcile_interrupted_jobs()
    assert reconciled == 0
    job = await repo.get_job("tenant-a", "job-1")
    assert job.status == "pending"
    assert job.retry_count == 0


@pytest.mark.asyncio
async def test_claim_next_pending_returns_oldest_first(repo):
    await repo.create_job("job-a", tenant_id="t1", source_type="subodha", scope="all", source_id=None, total_items=0)
    await repo.create_job("job-b", tenant_id="t1", source_type="subodha", scope="all", source_id=None, total_items=0)
    claimed = await repo.claim_next_pending("subodha")
    assert claimed.job_id == "job-a"
    assert claimed.status == "running"
    assert claimed.started_at is not None


@pytest.mark.asyncio
async def test_claim_next_pending_filters_by_source_type(repo):
    await repo.create_job("job-d", tenant_id="t1", source_type="other-source", scope="all", source_id=None, total_items=0)
    claimed = await repo.claim_next_pending("subodha")
    assert claimed is None


@pytest.mark.asyncio
async def test_claim_next_pending_returns_none_when_no_pending_jobs(repo):
    await repo.create_job("job-e", tenant_id="t1", source_type="subodha", scope="all", source_id=None, total_items=0)
    await repo.claim_next_pending("subodha")
    claimed = await repo.claim_next_pending("subodha")
    assert claimed is None


@pytest.mark.asyncio
async def test_reconcile_interrupted_jobs_requeues_running_job(repo):
    await repo.create_job("job-f", tenant_id="t1", source_type="subodha", scope="all", source_id=None, total_items=0)
    await repo.create_job("job-g", tenant_id="t1", source_type="subodha", scope="all", source_id=None, total_items=0)
    await repo.claim_next_pending("subodha")  # claims job-f (oldest), leaves it "running"

    count = await repo.reconcile_interrupted_jobs()
    assert count == 1  # only job-f was "running"; job-g ("pending") is untouched

    f = await repo.get_job("t1", "job-f")
    g = await repo.get_job("t1", "job-g")
    assert f.status == "pending"
    assert f.started_at is None
    assert f.error is None
    assert f.retry_count == 1
    assert g.status == "pending"
    assert g.retry_count == 0

    # requeued job is claimable again
    reclaimed = await repo.claim_next_pending("subodha")
    assert reclaimed.job_id == "job-f"


@pytest.mark.asyncio
async def test_reconcile_interrupted_jobs_fails_job_after_max_retries(repo):
    await repo.create_job("job-h", tenant_id="t1", source_type="subodha", scope="all", source_id=None, total_items=0)
    for _ in range(4):  # simulate MAX_INTERRUPTED_RETRIES (3) prior interruptions, then one more
        await repo.claim_next_pending("subodha")
        await repo.reconcile_interrupted_jobs()

    job = await repo.get_job("t1", "job-h")
    assert job.status == "failed"
    assert job.error == "exceeded max retries after interruption"
    assert job.retry_count == 4
