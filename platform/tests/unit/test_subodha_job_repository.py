from __future__ import annotations

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.repositories.subodha_job_repository import SubodhaJobRepository


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


@pytest.fixture
def repo(mock_db):
    return SubodhaJobRepository(mock_db)


@pytest.mark.asyncio
async def test_create_job_defaults(repo):
    job = await repo.create_job("job-1", scope="all", course_id=None, total_courses=0)
    assert job["_id"] == "job-1"
    assert job["status"] == "running"
    assert job["stats"] == {"saved": 0, "skipped": 0, "empty": 0, "failed": 0}
    assert job["courses"] == []


@pytest.mark.asyncio
async def test_set_total_courses(repo):
    await repo.create_job("job-1", scope="all", course_id=None, total_courses=0)
    updated = await repo.set_total_courses("job-1", 5)
    assert updated["totalCourses"] == 5


@pytest.mark.asyncio
async def test_append_course_result_updates_stats_and_processed(repo):
    await repo.create_job("job-1", scope="all", course_id=None, total_courses=2)
    await repo.append_course_result(
        "job-1", {"courseId": "c1", "name": "Course One", "status": "saved", "error": None, "at": "2026-01-01T00:00:00+00:00"}
    )
    updated = await repo.append_course_result(
        "job-1", {"courseId": "c2", "name": "Course Two", "status": "failed", "error": "boom", "at": "2026-01-01T00:00:01+00:00"}
    )
    assert updated["processed"] == 2
    assert updated["stats"]["saved"] == 1
    assert updated["stats"]["failed"] == 1
    assert [c["courseId"] for c in updated["courses"]] == ["c1", "c2"]


@pytest.mark.asyncio
async def test_set_job_status_sets_finished_at_and_error(repo):
    await repo.create_job("job-1", scope="all", course_id=None, total_courses=0)
    updated = await repo.set_job_status("job-1", "failed", error="explosion")
    assert updated["status"] == "failed"
    assert updated["error"] == "explosion"
    assert updated["finishedAt"] is not None


@pytest.mark.asyncio
async def test_get_active_jobs_only_returns_running(repo):
    await repo.create_job("job-1", scope="all", course_id=None, total_courses=0)
    await repo.create_job("job-2", scope="course", course_id="c9", total_courses=1)
    await repo.set_job_status("job-2", "completed")
    active = await repo.get_active_jobs()
    assert [j["_id"] for j in active] == ["job-1"]


@pytest.mark.asyncio
async def test_list_jobs_filters_by_scope_and_course(repo):
    await repo.create_job("job-1", scope="all", course_id=None, total_courses=0)
    await repo.create_job("job-2", scope="course", course_id="c9", total_courses=1)
    await repo.create_job("job-3", scope="course", course_id="c10", total_courses=1)

    course_jobs = await repo.list_jobs(scope="course")
    assert {j["_id"] for j in course_jobs} == {"job-2", "job-3"}

    one_course = await repo.list_jobs(course_id="c9")
    assert [j["_id"] for j in one_course] == ["job-2"]


@pytest.mark.asyncio
async def test_reconcile_interrupted_jobs_flips_running_to_failed(repo):
    await repo.create_job("job-1", scope="all", course_id=None, total_courses=0)
    await repo.create_job("job-2", scope="all", course_id=None, total_courses=0)
    await repo.set_job_status("job-2", "completed")

    reconciled = await repo.reconcile_interrupted_jobs()
    assert reconciled == 1

    job1 = await repo.get_job("job-1")
    assert job1["status"] == "failed"
    assert job1["error"] == "interrupted by restart"
