from __future__ import annotations

import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.subodha_job_repository import SubodhaJobRepository


@pytest_asyncio.fixture
async def mock_db():
    mongo_client = AsyncMongoMockClient()
    db = mongo_client["seeds_test_subodha_jobs"]
    yield db
    mongo_client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
def auth_headers():
    # get_current_user only decodes the JWT — no DB lookup — so no user seeding is needed.
    token = create_access_token({"sub": "tenant-1", "role": "tenant"})
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_active_jobs_empty_when_none_running(client, auth_headers):
    resp = await client.get("/subodha/sync/jobs/active", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"jobs": []}


@pytest.mark.asyncio
async def test_active_jobs_returns_running_job(client, auth_headers, mock_db):
    job_repo = SubodhaJobRepository(mock_db)
    await job_repo.create_job("job-1", scope="all", course_id=None, total_courses=3)

    resp = await client.get("/subodha/sync/jobs/active", headers=auth_headers)
    assert resp.status_code == 200
    jobs = resp.json()["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["jobId"] == "job-1"
    assert jobs[0]["scope"] == "all"


@pytest.mark.asyncio
async def test_jobs_history_filters_by_scope(client, auth_headers, mock_db):
    job_repo = SubodhaJobRepository(mock_db)
    await job_repo.create_job("job-all", scope="all", course_id=None, total_courses=0)
    await job_repo.create_job("job-course", scope="course", course_id="c1", total_courses=1)

    resp = await client.get("/subodha/sync/jobs?scope=course", headers=auth_headers)
    assert resp.status_code == 200
    jobs = resp.json()["jobs"]
    assert [j["jobId"] for j in jobs] == ["job-course"]


@pytest.mark.asyncio
async def test_sync_status_returns_404_for_unknown_job(client, auth_headers):
    resp = await client.get("/subodha/sync/status/no-such-job", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_stream_replays_done_immediately_for_finished_job(client, auth_headers, mock_db):
    job_repo = SubodhaJobRepository(mock_db)
    await job_repo.create_job("job-1", scope="all", course_id=None, total_courses=1)
    await job_repo.set_job_status("job-1", "completed")

    async with client.stream("GET", "/subodha/sync/stream/job-1", headers=auth_headers) as resp:
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        body = ""
        async for chunk in resp.aiter_text():
            body += chunk
            if "\n\n" in body:
                break

    assert body.startswith("data: ")
    payload = json.loads(body[len("data: "):].strip())
    assert payload["event"] == "done"
    assert payload["job"]["jobId"] == "job-1"
    assert payload["job"]["status"] == "completed"
