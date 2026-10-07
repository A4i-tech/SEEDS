from __future__ import annotations

import pytest

from app.aggregators.models import SourceType
from app.aggregators.sync_job_models import SyncOptions, SyncScope
from app.platform.error_handling import NotFoundError
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.services.content_aggregator_sync_jobs import SyncJobService
from app.services.subodha_service import SubodhaService
from tests.support.fake_blob import FakeBlob
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
def sync_jobs(job_repo, item_repo):
    return SyncJobService(job_repo, item_repo)


@pytest.fixture
def make_service(mock_db, sync_jobs):
    def _make(client):
        return SubodhaService(mock_db, FakeBlob(), client, sync_jobs)
    return _make


@pytest.mark.asyncio
async def test_run_sync_persists_every_course_result(make_service, job_repo, item_repo, content_repo, sync_jobs):
    client = FakeSubodhaClient([_course("c1", "Course One"), _course("c2", "Course Two")])
    service = make_service(client)
    job = await sync_jobs.create_job(tenant_id="tenant-a", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=0, options=SyncOptions())

    await service.run_sync("tenant-a", job.job_id, only_new=False, limit=0, dry_run=False)

    stored = await job_repo.get_job("tenant-a", job.job_id)
    assert stored.total_items == 2

    items = await item_repo.list_by_job("tenant-a", job.job_id)
    assert {c.source_id for c in items} == {"c1", "c2"}
    assert sum(1 for c in items if c.status == "saved") == 2

    tree = await content_repo.get_tree("tenant-a", "subodha", "c1")
    assert any(n.source_id == "html-1" for n in tree)


@pytest.mark.asyncio
async def test_run_single_course_sync_persists_one_result(make_service, job_repo, item_repo, content_repo, sync_jobs):
    client = FakeSubodhaClient([_course("c1", "Course One")])
    service = make_service(client)
    job = await sync_jobs.create_job(tenant_id="tenant-a", source_type=SourceType.SUBODHA, scope=SyncScope.COURSE, source_id="c1", total_items=1, options=SyncOptions())

    await service.run_single_course_sync("tenant-a", job.job_id, "c1", dry_run=False)

    items = await item_repo.list_by_job("tenant-a", job.job_id)
    assert items[0].source_id == "c1"
    assert items[0].status == "saved"


@pytest.mark.asyncio
async def test_get_course_returns_legacy_shaped_doc(make_service, job_repo, sync_jobs):
    client = FakeSubodhaClient([_course("c1", "Course One")])
    service = make_service(client)
    job = await sync_jobs.create_job(tenant_id="tenant-a", source_type=SourceType.SUBODHA, scope=SyncScope.COURSE, source_id="c1", total_items=1, options=SyncOptions())
    await service.run_single_course_sync("tenant-a", job.job_id, "c1", dry_run=False)

    doc = await service.get_course("tenant-a", "c1")
    assert doc.source_id == "c1"
    assert any(b.block_id == "html-1" for b in doc.blocks)


@pytest.mark.asyncio
async def test_get_course_returns_none_for_unenrolled_tenant(make_service, job_repo, sync_jobs):
    client = FakeSubodhaClient([_course("c1", "Course One")])
    service = make_service(client)
    job = await sync_jobs.create_job(tenant_id="tenant-a", source_type=SourceType.SUBODHA, scope=SyncScope.COURSE, source_id="c1", total_items=1, options=SyncOptions())
    await service.run_single_course_sync("tenant-a", job.job_id, "c1", dry_run=False)

    with pytest.raises(NotFoundError):
        await service.get_course("tenant-b", "c1")


@pytest.mark.asyncio
async def test_update_problem_block_is_private_to_the_editing_tenant(make_service, job_repo, sync_jobs):
    client = FakeSubodhaClient([_course("c1", "Course One")])
    service = make_service(client)
    job = await sync_jobs.create_job(tenant_id="tenant-a", source_type=SourceType.SUBODHA, scope=SyncScope.COURSE, source_id="c1", total_items=1, options=SyncOptions())
    await service.run_single_course_sync("tenant-a", job.job_id, "c1", dry_run=False)

    job_b = await sync_jobs.create_job(tenant_id="tenant-b", source_type=SourceType.SUBODHA, scope=SyncScope.COURSE, source_id="c1", total_items=1, options=SyncOptions())
    await service.run_single_course_sync("tenant-b", job_b.job_id, "c1", dry_run=False)
