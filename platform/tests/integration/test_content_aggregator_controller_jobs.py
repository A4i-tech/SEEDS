from __future__ import annotations

import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest_asyncio.fixture
async def mock_db():
    mongo_client = AsyncMongoMockClient()
    db = mongo_client["seeds_test_subodha_jobs"]
    yield db
    await mongo_client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _tenant_headers(tenant_id: str) -> dict[str, str]:
    # get_current_user only decodes the JWT — no DB lookup — so no user seeding is needed.
    token = create_access_token({"sub": tenant_id, "role": "tenant", "tenant_id": tenant_id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers():
    return _tenant_headers("tenant-a")


@pytest.mark.asyncio
async def test_active_jobs_empty_when_none_running(client, auth_headers):
    resp = await client.get("/content-aggregators/sync/jobs/active", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"jobs": []}


@pytest.mark.asyncio
async def test_active_jobs_returns_running_job(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=3)

    resp = await client.get("/content-aggregators/sync/jobs/active", headers=auth_headers)
    assert resp.status_code == 200
    jobs = resp.json()["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["job_id"] == "job-1"
    assert jobs[0]["scope"] == "all"


@pytest.mark.asyncio
async def test_active_jobs_does_not_leak_other_tenants_jobs(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-b", source_type="subodha", scope="all", source_id=None, total_items=3)

    resp = await client.get("/content-aggregators/sync/jobs/active", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"jobs": []}


@pytest.mark.asyncio
async def test_jobs_history_filters_by_scope(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-all", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=0)
    await job_repo.create_job("job-course", tenant_id="tenant-a", source_type="subodha", scope="course", source_id="c1", total_items=1)

    resp = await client.get("/content-aggregators/sync/jobs?scope=course", headers=auth_headers)
    assert resp.status_code == 200
    jobs = resp.json()["jobs"]
    assert [j["job_id"] for j in jobs] == ["job-course"]


@pytest.mark.asyncio
async def test_sync_status_returns_404_for_unknown_job(client, auth_headers):
    resp = await client.get("/content-aggregators/sync/status/no-such-job", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_sync_status_returns_404_for_other_tenants_job(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-b", source_type="subodha", scope="all", source_id=None, total_items=0)

    resp = await client.get("/content-aggregators/sync/status/job-1", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_stream_replays_done_immediately_for_finished_job(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=1)
    await job_repo.set_job_status("tenant-a", "job-1", "completed")

    async with client.stream("GET", "/content-aggregators/sync/stream/job-1", headers=auth_headers) as resp:
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
    assert payload["job"]["job_id"] == "job-1"
    assert payload["job"]["status"] == "completed"


@pytest.mark.asyncio
async def test_stream_yields_nothing_for_other_tenants_job(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-b", source_type="subodha", scope="all", source_id=None, total_items=1)
    await job_repo.set_job_status("tenant-b", "job-1", "completed")

    async with client.stream("GET", "/content-aggregators/sync/stream/job-1", headers=auth_headers) as resp:
        assert resp.status_code == 200
        body = b"".join([chunk async for chunk in resp.aiter_bytes()])

    assert body == b""


@pytest.mark.asyncio
async def test_courses_are_isolated_between_tenants(client, mock_db):
    from app.aggregators.models import CanonicalNode, NodeKind
    from app.repositories.content_aggregator_repository import ContentAggregatorRepository

    repo = ContentAggregatorRepository(mock_db)
    node = CanonicalNode(
        tenant_id="tenant-a", source_type="subodha", source_id="course-1", root_id="course-1", parent_id=None,
        order=0, node_kind=NodeKind.CONTAINER, item_type=None, display_name="A's course", content=None,
        lms_url=None, native_type="course", source_metadata={}, last_run_id="run-1",
        fetched_at="x", created_at="x", updated_at="x",
    )
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [node])

    a_resp = await client.get("/content-aggregators/subodha/courses", headers=_tenant_headers("tenant-a"))
    b_resp = await client.get("/content-aggregators/subodha/courses", headers=_tenant_headers("tenant-b"))
    assert len(a_resp.json()["courses"]) == 1
    assert len(b_resp.json()["courses"]) == 0

    a_detail = await client.get("/content-aggregators/subodha/courses/course-1", headers=_tenant_headers("tenant-a"))
    b_detail = await client.get("/content-aggregators/subodha/courses/course-1", headers=_tenant_headers("tenant-b"))
    assert a_detail.status_code == 200
    assert b_detail.status_code == 404


@pytest.mark.asyncio
async def test_hexis_source_is_wired(client, auth_headers):
    resp = await client.get("/content-aggregators/hexis/courses", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"courses": [], "next_cursor": None, "has_more": False}


@pytest.mark.asyncio
async def test_unknown_source_returns_404(client, auth_headers):
    resp = await client.get("/content-aggregators/nope/courses", headers=auth_headers)
    assert resp.status_code == 404
