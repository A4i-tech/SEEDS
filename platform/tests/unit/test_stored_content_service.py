from __future__ import annotations

import pytest

from app.aggregators.iris_adapter import IrisAdapter
from app.aggregators.iris_types import IrisBook, IrisTactile
from app.aggregators.models import BlobContext, SourceType
from app.platform.error_handling import AppError, NotFoundError
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.services.content_aggregator_sync_jobs import SyncJobService
from app.services.stored_content_service import StoredContentService
from tests.support.fake_blob import FakeBlob
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def mock_db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
def service(mock_db):
    jobs = SyncJobService(ContentAggregatorSyncJobRepository(mock_db), ContentAggregatorSyncJobItemRepository(mock_db))
    return StoredContentService(mock_db, FakeBlob(), jobs, SourceType.IRIS)


@pytest.fixture
async def stored(mock_db):
    tactile = IrisTactile(tactile_id="22", language_id="1", title_english="T", title="Title",
                          content={"name_1": "Head", "desc_1": "a"}, author_id="9", is_poster="0", audio_urls=[])
    adapter = IrisAdapter()
    blob = FakeBlob()
    nodes = adapter.build_canonical_nodes(IrisBook(book_id="101", name="Book", tactile_ids=["22"]), [tactile], "run1")
    processed = await adapter.process_nodes(nodes, lambda n: BlobContext(container="c", blob_prefix=n.source_id), blob)
    await ContentAggregatorRepository(mock_db).upsert_tree("t1", SourceType.IRIS, "101", processed)


@pytest.mark.asyncio
async def test_get_content_list_returns_roots(service, stored):
    summaries = await service.get_content_list("t1")
    assert [(s.id, s.name, s.synced) for s in summaries] == [("101", "Book", True)]


@pytest.mark.asyncio
async def test_get_course_returns_legacy_doc(service, stored):
    doc = await service.get_course("t1", "101")
    assert doc.source_id == "101"
    assert [b.block_id for b in doc.blocks] == ["101/t22/l1"]


@pytest.mark.asyncio
async def test_get_course_unknown_raises_not_found(service):
    with pytest.raises(NotFoundError):
        await service.get_course("t1", "999")


@pytest.mark.asyncio
async def test_run_sync_raises_sync_not_supported(service):
    with pytest.raises(AppError) as exc:
        await service.run_sync("t1", "j", only_new=False, limit=0, dry_run=False)
    assert exc.value.code == "SYNC_NOT_SUPPORTED"
