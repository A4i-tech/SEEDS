from __future__ import annotations

import asyncio

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.repositories.subodha_job_repository import SubodhaJobRepository
from app.services import subodha_jobs


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return SubodhaJobRepository(client["test_seeds"])


@pytest.mark.asyncio
async def test_create_job_generates_id_and_persists(repo):
    job = await subodha_jobs.create_job(repo, scope="all", course_id=None, total_courses=0)
    assert job["_id"]
    stored = await repo.get_job(job["_id"])
    assert stored is not None


def test_serialize_job_renames_id():
    serialized = subodha_jobs.serialize_job({"_id": "job-1", "status": "running"})
    assert serialized["jobId"] == "job-1"
    assert "_id" not in serialized


@pytest.mark.asyncio
async def test_subscribe_replays_done_immediately_for_finished_job(repo):
    job = await subodha_jobs.create_job(repo, scope="all", course_id=None, total_courses=1)
    await subodha_jobs.finish_job(repo, job["_id"], "completed")

    events = []
    async for event in subodha_jobs.subscribe(repo, job["_id"]):
        events.append(event)

    # job already finished before subscribing -> immediately told "done", no hang
    assert len(events) == 1
    assert events[0]["event"] == "done"
    assert events[0]["job"]["jobId"] == job["_id"]
    assert events[0]["job"]["status"] == "completed"


@pytest.mark.asyncio
async def test_subscribe_streams_live_progress_then_done(repo):
    job = await subodha_jobs.create_job(repo, scope="all", course_id=None, total_courses=1)

    received = []

    async def consume():
        async for event in subodha_jobs.subscribe(repo, job["_id"]):
            received.append(event)

    consumer_task = asyncio.create_task(consume())
    await asyncio.sleep(0.05)  # let the consumer register as a subscriber

    await subodha_jobs.record_course_result(
        repo, job["_id"], {"courseId": "c1", "name": "Course One", "status": "saved", "error": None, "at": "now"}
    )
    await subodha_jobs.finish_job(repo, job["_id"], "completed")

    await asyncio.wait_for(consumer_task, timeout=2)

    events_by_type = [e["event"] for e in received]
    assert events_by_type == ["progress", "progress", "done"]
    assert received[1]["job"]["processed"] == 1
    assert received[-1]["job"]["status"] == "completed"


@pytest.mark.asyncio
async def test_subscribe_unknown_job_yields_nothing(repo):
    events = [e async for e in subodha_jobs.subscribe(repo, "no-such-job")]
    assert events == []
