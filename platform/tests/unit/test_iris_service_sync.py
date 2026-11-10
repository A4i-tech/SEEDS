from __future__ import annotations

import pytest

from app.aggregators.models import CanonicalNode, NodeKind, SourceType
from app.platform.error_handling import AppError, NotFoundError
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


@pytest.fixture
def mock_db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
def sync_jobs(mock_db):
    return SyncJobService(ContentAggregatorSyncJobRepository(mock_db), ContentAggregatorSyncJobItemRepository(mock_db))


@pytest.fixture
def service(mock_db, sync_jobs):
    return IrisService(mock_db, FakeBlob(), sync_jobs)


def _node(source_id="book-101", root_id="book-101"):
    return CanonicalNode(
        source_type="iris", source_id=source_id, root_id=root_id, parent_id=None,
        order=0, node_kind=NodeKind.CONTAINER, item_type=None, display_name="Book 101", content=None,
        lms_url="", native_type="book", source_metadata={}, last_run_id="run-1",
        fetched_at="x", created_at="x", updated_at="x",
    )


@pytest.mark.asyncio
async def test_run_sync_raises_not_supported(service):
    with pytest.raises(AppError) as exc:
        await service.run_sync("t1", "job-1", only_new=False, limit=0, dry_run=False)
    assert (exc.value.code, exc.value.status_code) == ("SYNC_NOT_SUPPORTED", 400)


@pytest.mark.asyncio
async def test_run_single_course_sync_raises_not_supported(service):
    with pytest.raises(AppError) as exc:
        await service.run_single_course_sync("t1", "job-1", "book-101", dry_run=False)
    assert exc.value.code == "SYNC_NOT_SUPPORTED"


@pytest.mark.asyncio
async def test_get_content_list_serves_stored_roots(service, mock_db):
    await ContentAggregatorRepository(mock_db).upsert_tree("t1", SourceType.IRIS, "book-101", [_node()])

    courses = await service.get_content_list("t1")

    assert [c.id for c in courses] == ["book-101"]


@pytest.mark.asyncio
async def test_get_course_serves_stored_tree(service, mock_db):
    await ContentAggregatorRepository(mock_db).upsert_tree("t1", SourceType.IRIS, "book-101", [_node()])

    doc = await service.get_course("t1", "book-101")

    assert doc is not None


@pytest.mark.asyncio
async def test_get_course_missing_raises_not_found(service):
    with pytest.raises(NotFoundError):
        await service.get_course("t1", "nope")
