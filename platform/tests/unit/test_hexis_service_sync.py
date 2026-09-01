from __future__ import annotations

import pytest

from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.services import content_aggregator_sync_jobs as jobs
from app.services.hexis_service import HexisService
from tests.support.mongomock_async import AsyncMongoMockClient


class FakeHexisClient:
    def __init__(self, items):
        self._items = items

    async def get_session(self):
        return "JWT"

    def clear_session_cache(self):
        pass

    async def list_content(self, aid):
        return self._items

    async def get_subjects(self):
        return {"3": "Science", "5": "English"}


class FakeBlob:
    def __init__(self):
        self.store: dict[str, bytes] = {}

    async def upload_file(self, container, blob_name, data, content_type="application/octet-stream"):
        self.store[blob_name] = data
        return f"https://blob.test/{container}/{blob_name}"

    async def download_from_url(self, url: str) -> bytes:
        return self.store[url[len("https://blob.test/contentAggregators/"):]]


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
def content_repo(mock_db):
    return ContentAggregatorRepository(mock_db)


@pytest.fixture
def service(mock_db):
    return HexisService(mock_db, blob=FakeBlob())


@pytest.mark.asyncio
async def test_collect_and_sync_units_persists_one_tree_per_subject(service, job_repo, item_repo, content_repo):
    client = FakeHexisClient(_ITEMS)
    job = await jobs.create_job(job_repo, tenant_id="t1", source_type="hexis", scope="all", source_id=None, total_items=0)

    collected = await service.collect_units(client)
    await jobs.set_total(job_repo, item_repo, "t1", job.job_id, len(collected.units))
    await service.sync_units("t1", client, job_repo, item_repo, job.job_id, collected.session, collected.units)

    assert collected.total_available == 2
    items = await item_repo.list_by_job("t1", job.job_id)
    assert {c.source_id for c in items} == {"3", "5"}
    stats = await item_repo.get_stats("t1", job.job_id)
    assert stats.saved == 2
    tree = await content_repo.get_tree("t1", "hexis", "3")
    assert any(n.source_id == "15950" for n in tree)


@pytest.mark.asyncio
async def test_resync_skips_unchanged(service, job_repo):
    client = FakeHexisClient(_ITEMS)
    subject = {"subject_id": "3", "items": [_ITEMS[0]]}
    r1 = await service.process_course("t1", client, subject, "JWT", "run1", False)
    r2 = await service.process_course("t1", client, subject, "JWT", "run2", False)
    assert r1["status"] == "saved"
    assert r2["status"] == "skipped"


@pytest.mark.asyncio
async def test_get_course_returns_legacy_doc(service, job_repo, item_repo):
    client = FakeHexisClient(_ITEMS)
    job = await jobs.create_job(job_repo, tenant_id="t1", source_type="hexis", scope="course", source_id="3", total_items=1)
    await service.run_single_course_sync("t1", client, job_repo, item_repo, job.job_id, "3")

    doc = await service.get_course("t1", "3")
    assert doc.source_id == "3"
    assert any(b.block_id == "15950" for b in doc.blocks)
