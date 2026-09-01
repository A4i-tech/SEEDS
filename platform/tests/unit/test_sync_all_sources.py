from __future__ import annotations

import pytest

from app.aggregators.source_types import CollectedUnits, SourceBinding
from app.aggregators.sync_job_models import SyncItemResult
from app.controllers.content_aggregator_controller import _run_all_sources_sync_job
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.services import content_aggregator_sync_jobs as jobs
from app.services.content_aggregator_sync_jobs import record_item_result
from tests.support.mongomock_async import AsyncMongoMockClient


class FakeService:
    def __init__(self, units, source_type="subodha", fail=False):
        self._units = units
        self.SOURCE_TYPE = source_type
        self._fail = fail

    async def get_course_diff(self, tenant_id, client):
        return {"newCourseIds": [u["id"] for u in self._units]}

    async def collect_units(self, client, *, course_ids=None, limit=None):
        if self._fail:
            raise RuntimeError("403 Forbidden")
        units = self._units
        if course_ids is not None:
            units = [u for u in units if u["id"] in set(course_ids)]
        if limit is not None:
            units = units[:limit]
        return CollectedUnits(session="session", units=units, total_available=len(self._units))

    async def sync_units(self, tenant_id, client, job_repo, item_repo, job_id, session, units, *, dry_run=False):
        for u in units:
            await record_item_result(
                job_repo, item_repo, tenant_id, job_id,
                SyncItemResult(source_id=u["id"], name=u["id"], status="saved", error=None, at="t"),
            )


def _repos():
    db = AsyncMongoMockClient()["test_seeds"]
    return ContentAggregatorSyncJobRepository(db), ContentAggregatorSyncJobItemRepository(db)


@pytest.mark.asyncio
async def test_combined_job_sums_totals_and_records_all_sources():
    job_repo, item_repo = _repos()
    job = await jobs.create_job(job_repo, tenant_id="t1", source_type="all", scope="all", source_id=None, total_items=0)
    bindings = [
        SourceBinding(service=FakeService([{"id": "a"}, {"id": "b"}]), client=None),
        SourceBinding(service=FakeService([{"id": "x"}]), client=None),
    ]

    await _run_all_sources_sync_job("t1", job.job_id, bindings, job_repo, item_repo, only_new=False, dry_run=False, limit=None)

    stored = await job_repo.get_job("t1", job.job_id)
    assert stored.status == "completed"
    assert stored.total_items == 3
    items = await item_repo.list_by_job("t1", job.job_id)
    assert {i.source_id for i in items} == {"a", "b", "x"}


@pytest.mark.asyncio
async def test_combined_job_only_new_uses_each_sources_diff():
    job_repo, item_repo = _repos()
    job = await jobs.create_job(job_repo, tenant_id="t1", source_type="all", scope="all", source_id=None, total_items=0)
    bindings = [
        SourceBinding(service=FakeService([{"id": "a"}]), client=None),
        SourceBinding(service=FakeService([{"id": "x"}, {"id": "y"}]), client=None),
    ]

    await _run_all_sources_sync_job("t1", job.job_id, bindings, job_repo, item_repo, only_new=True, dry_run=False, limit=None)

    stored = await job_repo.get_job("t1", job.job_id)
    assert stored.total_items == 3
    assert stored.status == "completed"


@pytest.mark.asyncio
async def test_one_source_failure_does_not_abort_the_others():
    job_repo, item_repo = _repos()
    job = await jobs.create_job(job_repo, tenant_id="t1", source_type="all", scope="all", source_id=None, total_items=0)
    bindings = [
        SourceBinding(service=FakeService([{"id": "a"}, {"id": "b"}], source_type="subodha"), client=None),
        SourceBinding(service=FakeService([], source_type="hexis", fail=True), client=None),
    ]

    await _run_all_sources_sync_job("t1", job.job_id, bindings, job_repo, item_repo, only_new=False, dry_run=False, limit=None)

    stored = await job_repo.get_job("t1", job.job_id)
    assert stored.status == "completed"
    stats = await item_repo.get_stats("t1", job.job_id)
    assert stats.saved == 2
    assert stats.failed == 1
    items = await item_repo.list_by_job("t1", job.job_id)
    failed = next(i for i in items if i.status == "failed")
    assert failed.source_id == "hexis" and "403" in (failed.error or "")
