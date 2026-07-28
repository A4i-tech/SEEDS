from __future__ import annotations

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.repositories.subodha_job_repository import SubodhaJobRepository
from app.services import subodha_jobs
from app.services.subodha_service import SubodhaService


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
        return {"blocks": {"root": {"type": "course", "children": []}}, "root": "root"}

    async def enrich_blocks_with_content(self, blocks_response, session_cookie):
        return None


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


@pytest.fixture
def job_repo(mock_db):
    return SubodhaJobRepository(mock_db)


@pytest.fixture
def service(mock_db):
    return SubodhaService(mock_db)


@pytest.mark.asyncio
async def test_run_sync_persists_every_course_result(service, job_repo):
    courses = [
        {"id": "c1", "name": "Course One"},
        {"id": "c2", "name": "Course Two"},
    ]
    client = FakeSubodhaClient(courses)
    job = await subodha_jobs.create_job(job_repo, scope="all", course_id=None, total_courses=0)

    summary = await service.run_sync(client, job_repo, job["_id"])

    assert summary["totalCourses"] == 2
    assert summary["processed"] == 2

    doc = await job_repo.get_job(job["_id"])
    assert doc["totalCourses"] == 2
    assert doc["processed"] == 2
    assert {c["courseId"] for c in doc["courses"]} == {"c1", "c2"}
    # FakeSubodhaClient's empty outline means every course maps to "empty"
    assert doc["stats"]["empty"] == 2


@pytest.mark.asyncio
async def test_run_single_course_sync_persists_one_result(service, job_repo):
    courses = [{"id": "c1", "name": "Course One"}]
    client = FakeSubodhaClient(courses)
    job = await subodha_jobs.create_job(job_repo, scope="course", course_id="c1", total_courses=1)

    summary = await service.run_single_course_sync(client, job_repo, job["_id"], "c1")

    assert summary["processed"] == 1
    doc = await job_repo.get_job(job["_id"])
    assert doc["courses"][0]["courseId"] == "c1"
    assert doc["courses"][0]["status"] == "empty"
