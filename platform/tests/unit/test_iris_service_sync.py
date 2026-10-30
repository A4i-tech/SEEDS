from __future__ import annotations

import pytest

from app.aggregators.iris_types import IrisBook, IrisTactile
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
from app.services.iris_service import IrisService
from tests.support.fake_blob import FakeBlob
from tests.support.mongomock_async import AsyncMongoMockClient


def _tactile(tactile_id, desc="a"):
    return IrisTactile(
        tactile_id=tactile_id, language_id="1", title_english="T", title=f"Title {tactile_id}",
        content={"name_1": "Head", "desc_1": desc}, author_id="9", is_poster="0", audio_urls=[],
    )


class FakeIrisClient:
    def __init__(self, books, tactiles_by_book):
        self.books = books
        self.tactiles_by_book = tactiles_by_book
        self.failing: set[str] = set()

    async def list_books(self):
        return self.books

    async def list_tactiles(self, book_id):
        if book_id in self.failing:
            raise RuntimeError("iris down")
        return self.tactiles_by_book[book_id]


_BOOK_101 = IrisBook(book_id="101", name="Book 101", tactile_ids=["22", "25"])
_BOOK_102 = IrisBook(book_id="102", name="Book 102", tactile_ids=["31"])


@pytest.fixture
def mock_db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
def sync_jobs(mock_db):
    return SyncJobService(ContentAggregatorSyncJobRepository(mock_db), ContentAggregatorSyncJobItemRepository(mock_db))


@pytest.fixture
def item_repo(mock_db):
    return ContentAggregatorSyncJobItemRepository(mock_db)


@pytest.fixture
def client():
    return FakeIrisClient(
        [_BOOK_101, _BOOK_102], {"101": [_tactile("22"), _tactile("25")], "102": [_tactile("31")]}
    )


@pytest.fixture
def service(mock_db, sync_jobs, client):
    return IrisService(mock_db, FakeBlob(), client, sync_jobs)


async def _new_job(sync_jobs, scope=SyncScope.ALL, source_id=""):
    return await sync_jobs.create_job(
        tenant_id="t1", source_type=SourceType.IRIS, scope=scope, source_id=source_id, total_items=0,
        options=SyncOptions(),
    )


async def _tree_ids(mock_db, book_id):
    tree = await ContentAggregatorRepository(mock_db).get_tree("t1", SourceType.IRIS, book_id)
    return {n.source_id for n in tree}


@pytest.mark.asyncio
async def test_sync_saves_tree_per_book(service, sync_jobs, item_repo, mock_db):
    job = await _new_job(sync_jobs)
    await service.run_sync("t1", job.job_id, only_new=False, limit=0, dry_run=False)

    assert (await item_repo.get_stats("t1", job.job_id)).saved == 2
    assert len(await _tree_ids(mock_db, "101")) == 6


@pytest.mark.asyncio
async def test_book_without_tactiles_is_empty(service, client):
    client.tactiles_by_book["101"] = []
    outcome = await service.process_course("t1", _BOOK_101, "r1", False)
    assert outcome.status == SyncItemStatus.EMPTY


@pytest.mark.asyncio
async def test_second_sync_unchanged_is_skipped(service):
    first = await service.process_course("t1", _BOOK_101, "r1", False)
    second = await service.process_course("t1", _BOOK_101, "r2", False)
    assert (first.status, second.status) == (SyncItemStatus.SAVED, SyncItemStatus.SKIPPED)


@pytest.mark.asyncio
async def test_second_sync_drops_removed_label_keeps_others(service, client, mock_db):
    await service.process_course("t1", _BOOK_101, "r1", False)
    client.tactiles_by_book["101"] = [_tactile("25")]
    await service.process_course("t1", _BOOK_101, "r2", False)

    ids = await _tree_ids(mock_db, "101")
    assert "101/t22/l1" not in ids
    assert "101/t25/l1" in ids


@pytest.mark.asyncio
async def test_returned_label_is_back_after_third_sync(service, client, mock_db):
    await service.process_course("t1", _BOOK_101, "r1", False)
    client.tactiles_by_book["101"] = [_tactile("25")]
    await service.process_course("t1", _BOOK_101, "r2", False)
    client.tactiles_by_book["101"] = [_tactile("22"), _tactile("25")]
    await service.process_course("t1", _BOOK_101, "r3", False)

    assert "101/t22/l1" in await _tree_ids(mock_db, "101")
    doc = await ContentAggregatorRepository(mock_db)._col.find_one({"source_id": "101/t22/l1"})
    assert doc["is_deleted"] is False and doc["deleted_at"] == ""


@pytest.mark.asyncio
async def test_failed_fetch_marks_failed_and_leaves_stored_tree(service, client, mock_db):
    await service.process_course("t1", _BOOK_101, "r1", False)
    before = await _tree_ids(mock_db, "101")
    client.failing.add("101")

    outcome = await service.process_course("t1", _BOOK_101, "r2", False)

    assert outcome.status == SyncItemStatus.FAILED and "iris down" in outcome.error
    assert await _tree_ids(mock_db, "101") == before


@pytest.mark.asyncio
async def test_failure_in_one_book_does_not_affect_another(service, client, sync_jobs, item_repo, mock_db):
    client.failing.add("101")
    job = await _new_job(sync_jobs)
    await service.run_sync("t1", job.job_id, only_new=False, limit=0, dry_run=False)

    stats = await item_repo.get_stats("t1", job.job_id)
    assert (stats.saved, stats.failed) == (1, 1)
    assert await _tree_ids(mock_db, "102")


@pytest.mark.asyncio
async def test_only_new_skips_stored_books(service, sync_jobs, item_repo):
    first = await _new_job(sync_jobs)
    await service.run_sync("t1", first.job_id, only_new=False, limit=1, dry_run=False)
    second = await _new_job(sync_jobs)
    await service.run_sync("t1", second.job_id, only_new=True, limit=0, dry_run=False)
    assert len(await item_repo.list_by_job("t1", second.job_id)) == 1


@pytest.mark.asyncio
async def test_run_single_course_sync_unknown_book_raises_value_error(service, sync_jobs):
    job = await _new_job(sync_jobs, SyncScope.COURSE, "999")
    with pytest.raises(ValueError, match="999"):
        await service.run_single_course_sync("t1", job.job_id, "999", dry_run=False)


@pytest.mark.asyncio
async def test_get_course_returns_doc_and_unknown_raises(service, sync_jobs):
    job = await _new_job(sync_jobs, SyncScope.COURSE, "101")
    await service.run_single_course_sync("t1", job.job_id, "101", dry_run=False)
    doc = await service.get_course("t1", "101")
    assert {b.block_id for b in doc.blocks} == {"101/t22/l1", "101/t25/l1"}
    with pytest.raises(NotFoundError):
        await service.get_course("t1", "999")


@pytest.mark.asyncio
async def test_claim_next_pending_job_only_returns_iris_jobs(service, sync_jobs):
    await sync_jobs.create_job(
        tenant_id="t1", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=0,
        options=SyncOptions(),
    )
    iris_job = await _new_job(sync_jobs)
    claimed = await service.claim_next_pending_job()
    assert claimed.job_id == iris_job.job_id
    assert await service.claim_next_pending_job() is None
