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
from app.services.subodha_service import SubodhaService
from tests.support.mongomock_async import AsyncMongoMockClient


class FakeSubodhaClient:
    def __init__(self, courses):
        self._courses = courses

    async def get_session(self):
        return "cookie"

    def clear_session_cache(self):
        pass

    async def list_all_courses(self):
        return self._courses

    async def fetch_blocks(self, course_id, session_cookie):
        return {
            "root": "course",
            "blocks": {
                "course": {"type": "course", "children": ["chapter-1"]},
                "chapter-1": {"type": "chapter", "children": ["seq-1"]},
                "seq-1": {"type": "sequential", "children": ["vert-1"]},
                "vert-1": {"type": "vertical", "children": ["html-1"]},
                "html-1": {"type": "html", "display_name": "Welcome", "student_view_html": "<p>Hi</p>",
                           "student_view_data": None, "lms_web_url": "https://lms/html-1"},
            },
        }

    async def enrich_blocks_with_content(self, blocks_response, session_cookie):
        return None


class FakeBlobStorageProvider:
    def __init__(self):
        self.uploaded: dict[str, bytes] = {}

    async def upload_file(self, container, blob_name, data, content_type="application/octet-stream"):
        self.uploaded[blob_name] = data
        return f"https://blob.test/{container}/{blob_name}"

    async def download_from_url(self, blob_url: str) -> bytes:
        prefix = "https://blob.test/subodha/"
        blob_name = blob_url[len(prefix):]
        return self.uploaded[blob_name]


def _course(course_id: str, name: str) -> dict[str, object]:
    return {
        "id": course_id, "name": name, "org": "edX", "number": course_id.upper(), "short_description": "",
        "language": "en", "start": "2030-01-01T00:00:00+00:00", "pacing": "self_paced",
        "hidden": False, "invitation_only": False, "mobile_available": True,
    }


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
    return SubodhaService(mock_db, blob=FakeBlobStorageProvider())


@pytest.mark.asyncio
async def test_collect_and_sync_units_persists_every_course_result(service, job_repo, item_repo, content_repo):
    client = FakeSubodhaClient([_course("c1", "Course One"), _course("c2", "Course Two")])
    job = await jobs.create_job(job_repo, tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)

    collected = await service.collect_units(client)
    await jobs.set_total(job_repo, item_repo, "tenant-a", job.job_id, len(collected.units))
    await service.sync_units("tenant-a", client, job_repo, item_repo, job.job_id, collected.session, collected.units)

    assert collected.total_available == 2
    stored = await job_repo.get_job("tenant-a", job.job_id)
    assert stored.total_items == 2
    items = await item_repo.list_by_job("tenant-a", job.job_id)
    assert {c.source_id for c in items} == {"c1", "c2"}
    stats = await item_repo.get_stats("tenant-a", job.job_id)
    assert stats.saved == 2

    tree = await content_repo.get_tree("tenant-a", "subodha", "c1")
    assert any(n.source_id == "html-1" for n in tree)


@pytest.mark.asyncio
async def test_run_single_course_sync_persists_one_result(service, job_repo, item_repo, content_repo):
    client = FakeSubodhaClient([_course("c1", "Course One")])
    job = await jobs.create_job(job_repo, tenant_id="tenant-a", source_type="subodha", scope="course", source_id="c1", total_items=1)

    summary = await service.run_single_course_sync("tenant-a", client, job_repo, item_repo, job.job_id, "c1")

    assert summary["processed"] == 1
    items = await item_repo.list_by_job("tenant-a", job.job_id)
    assert items[0].source_id == "c1"
    assert items[0].status == "saved"


@pytest.mark.asyncio
async def test_get_course_returns_legacy_shaped_doc(service, job_repo, item_repo):
    client = FakeSubodhaClient([_course("c1", "Course One")])
    job = await jobs.create_job(job_repo, tenant_id="tenant-a", source_type="subodha", scope="course", source_id="c1", total_items=1)
    await service.run_single_course_sync("tenant-a", client, job_repo, item_repo, job.job_id, "c1")

    doc = await service.get_course("tenant-a", "c1")
    assert doc.source_id == "c1"
    assert any(b.block_id == "html-1" for b in doc.blocks)
