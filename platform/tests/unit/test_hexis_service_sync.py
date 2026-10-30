from __future__ import annotations

import pytest

from app.aggregators.hexis_types import HexisSubject
from app.aggregators.models import SourceType
from app.aggregators.sync_job_models import SyncItemStatus, SyncOptions, SyncScope
from app.platform.error_handling import NotFoundError
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.services.content_aggregator_sync_jobs import SyncJobService
from app.services.hexis_service import HexisService
from tests.support.fake_blob import FakeBlob
from tests.support.mongomock_async import AsyncMongoMockClient


class FakeHexisClient:
    def __init__(self, items):
        self._items = items

    async def list_content(self, aid):
        return self._items

    async def get_subjects(self):
        return {"3": "Science", "5": "English"}


_ITEMS = [
    {"cid": "15950", "title": "NEWS WEEK 16", "class": "8", "language": "1", "subject": "3", "ctype": "2",
     "actual_content": "body", "folder": "news", "common_content": "1", "author_id": "241"},
    {"cid": "42", "title": "Quiz", "class": "8", "language": "8", "subject": "5", "ctype": "3",
     "actual_content": '{"question":"q","a1":"x","a2":"y","a3":"z","ca":1}', "folder": "mcq",
     "common_content": "0", "author_id": "99"},
]


@pytest.fixture
def mock_db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
def job_repo(mock_db):
    return ContentAggregatorSyncJobRepository(mock_db)


@pytest.fixture
def item_repo(mock_db):
    return ContentAggregatorSyncJobItemRepository(mock_db)


@pytest.fixture
def sync_jobs(job_repo, item_repo):
    return SyncJobService(job_repo, item_repo)


@pytest.fixture
def service(mock_db, sync_jobs):
    return HexisService(mock_db, FakeBlob(), FakeHexisClient(_ITEMS), sync_jobs)


async def _new_job(sync_jobs, scope, source_id=""):
    return await sync_jobs.create_job(
        tenant_id="t1", source_type=SourceType.HEXIS, scope=scope, source_id=source_id, total_items=0,
        options=SyncOptions(),
    )


@pytest.mark.asyncio
async def test_run_sync_persists_one_tree_per_subject(service, sync_jobs, item_repo, mock_db):
    job = await _new_job(sync_jobs, SyncScope.ALL)

    await service.run_sync("t1", job.job_id, only_new=False, limit=0, dry_run=False)

    items = await item_repo.list_by_job("t1", job.job_id)
    assert {c.source_id for c in items} == {"3", "5"}
    assert (await item_repo.get_stats("t1", job.job_id)).saved == 2
    tree = await ContentAggregatorRepository(mock_db).get_tree("t1", SourceType.HEXIS, "3")
    assert any(n.source_id == "15950" for n in tree)


@pytest.mark.asyncio
async def test_run_sync_only_new_skips_stored_subjects(service, sync_jobs, item_repo):
    first = await _new_job(sync_jobs, SyncScope.ALL)
    await service.run_sync("t1", first.job_id, only_new=False, limit=1, dry_run=False)
    second = await _new_job(sync_jobs, SyncScope.ALL)

    await service.run_sync("t1", second.job_id, only_new=True, limit=0, dry_run=False)

    assert len(await item_repo.list_by_job("t1", second.job_id)) == 1


@pytest.mark.asyncio
async def test_resync_skips_unchanged(service):
    subject = HexisSubject(subject_id="3", name="Science", items=[_ITEMS[0]])
    r1 = await service.process_course("t1", subject, "run1", False)
    r2 = await service.process_course("t1", subject, "run2", False)
    assert r1.status == SyncItemStatus.SAVED
    assert r2.status == SyncItemStatus.SKIPPED


@pytest.mark.asyncio
async def test_run_single_course_sync_then_get_course(service, sync_jobs):
    job = await _new_job(sync_jobs, SyncScope.COURSE, "3")
    await service.run_single_course_sync("t1", job.job_id, "3", dry_run=False)

    doc = await service.get_course("t1", "3")
    assert doc.source_id == "3"
    assert any(b.block_id == "15950" for b in doc.blocks)


@pytest.mark.asyncio
async def test_get_course_raises_when_not_synced(service):
    with pytest.raises(NotFoundError):
        await service.get_course("t1", "3")


@pytest.mark.asyncio
async def test_run_single_course_sync_unknown_subject_raises(service, sync_jobs):
    job = await _new_job(sync_jobs, SyncScope.COURSE, "999")
    with pytest.raises(ValueError, match="999"):
        await service.run_single_course_sync("t1", job.job_id, "999", dry_run=False)


@pytest.mark.asyncio
async def test_claim_next_pending_job_only_returns_hexis_jobs(service, sync_jobs):
    await sync_jobs.create_job(
        tenant_id="t1", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=0,
        options=SyncOptions(),
    )
    hexis_job = await _new_job(sync_jobs, SyncScope.ALL)

    claimed = await service.claim_next_pending_job()

    assert claimed.job_id == hexis_job.job_id
    assert await service.claim_next_pending_job() is None
