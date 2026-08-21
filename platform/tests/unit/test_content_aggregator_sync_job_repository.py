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
    assert job.status == "running"
    assert job.source_type == "subodha"

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
async def test_reconcile_interrupted_jobs_not_tenant_scoped(repo):
    await repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    reconciled = await repo.reconcile_interrupted_jobs()
    assert reconciled == 1
    job = await repo.get_job("tenant-a", "job-1")
    assert job.status == "failed"
