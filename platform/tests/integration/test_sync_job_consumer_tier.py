from __future__ import annotations

import asyncio

import pytest

from app.consumers.sync_job_consumer import SyncJobConsumer
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.services.content_aggregator_sync_jobs import SyncJobService
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
    return AsyncMongoMockClient()["test_seeds_sync_job_consumer_tier"]


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
def mock_subodha_client():
    return FakeSubodhaClient([_course("c1", "Course One")])


@pytest.fixture
def mock_subodha_service(mock_db, mock_subodha_client):
    return SubodhaService(mock_db, blob=FakeBlobStorageProvider(), client=mock_subodha_client)


@pytest.mark.asyncio
async def test_full_sync_job_lifecycle_through_consumer(
    job_repo, mock_db, mock_subodha_service, sync_jobs,
):
    job = await sync_jobs.create_job(
        tenant_id="t1", source_type="subodha", scope="all", source_id=None, total_items=0,
    )
    assert job.status == "pending"

    consumer = SyncJobConsumer(db=mock_db, poll_interval_seconds=0.01, service=mock_subodha_service)
    consumer_task = asyncio.create_task(consumer._run_loop())

    # subscribe() treats any non-"running" status as terminal, so wait for the
    # consumer to actually claim the job (pending -> running) before starting
    # to poll — otherwise we'd race the claim and see a stale "done" for the
    # still-"pending" job.
    for _ in range(200):
        current = await job_repo.get_job("t1", job.job_id)
        if current is not None and current.status != "pending":
            break
        await asyncio.sleep(0.01)
    else:
        pytest.fail("consumer never claimed the pending job")

    events = []
    async for event in sync_jobs.subscribe("t1", job.job_id):
        events.append(event)
        if event["event"] == "done":
            break

    consumer_task.cancel()

    assert events[-1]["event"] == "done"
    final = await job_repo.get_job("t1", job.job_id)
    assert final.status == "completed"
