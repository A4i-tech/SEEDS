from __future__ import annotations

import json

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.aggregators.models import CanonicalNode, NodeKind, SourceType
from app.aggregators.sync_job_models import (
    SyncItemResult,
    SyncItemStatus,
    SyncJobStatus,
    SyncOptions,
    SyncScope,
)
from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
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
    await job_repo.create_job("job-1", tenant_id="tenant-a", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=3, options=SyncOptions())

    resp = await client.get("/content-aggregators/sync/jobs/active", headers=auth_headers)
    assert resp.status_code == 200
    jobs = resp.json()["jobs"]
    assert len(jobs) == 1
    assert jobs[0]["job_id"] == "job-1"
    assert jobs[0]["scope"] == "all"


@pytest.mark.asyncio
async def test_active_jobs_does_not_leak_other_tenants_jobs(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-b", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=3, options=SyncOptions())

    resp = await client.get("/content-aggregators/sync/jobs/active", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"jobs": []}


@pytest.mark.asyncio
async def test_jobs_history_filters_by_scope(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-all", tenant_id="tenant-a", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=0, options=SyncOptions())
    await job_repo.create_job("job-course", tenant_id="tenant-a", source_type=SourceType.SUBODHA, scope=SyncScope.COURSE, source_id="c1", total_items=1, options=SyncOptions())

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
    await job_repo.create_job("job-1", tenant_id="tenant-b", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=0, options=SyncOptions())

    resp = await client.get("/content-aggregators/sync/status/job-1", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_stream_replays_done_immediately_for_finished_job(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-a", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=1, options=SyncOptions())
    await job_repo.set_job_status("tenant-a", "job-1", SyncJobStatus.COMPLETED)

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
    await job_repo.create_job("job-1", tenant_id="tenant-b", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=1, options=SyncOptions())
    await job_repo.set_job_status("tenant-b", "job-1", SyncJobStatus.COMPLETED)

    async with client.stream("GET", "/content-aggregators/sync/stream/job-1", headers=auth_headers) as resp:
        assert resp.status_code == 200
        body = b"".join([chunk async for chunk in resp.aiter_bytes()])

    assert body == b""


@pytest.mark.asyncio
async def test_sync_job_items_returns_404_for_unknown_job(client, auth_headers):
    resp = await client.get("/content-aggregators/sync/status/no-such-job/items", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_sync_job_items_returns_404_for_other_tenants_job(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-b", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=0, options=SyncOptions())

    resp = await client.get("/content-aggregators/sync/status/job-1/items", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_sync_job_items_paginates(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    item_repo = ContentAggregatorSyncJobItemRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-a", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="", total_items=3, options=SyncOptions())
    for i in range(3):
        await item_repo.insert("tenant-a", "job-1", SyncItemResult(f"c{i}", f"Course {i}", SyncItemStatus.SAVED, "", "x"))

    resp = await client.get("/content-aggregators/sync/status/job-1/items?limit=2", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 2
    assert body["total"] == 3
    assert body["next_cursor"] is not None

    resp2 = await client.get(
        f"/content-aggregators/sync/status/job-1/items?limit=2&after={body['next_cursor']}",
        headers=auth_headers,
    )
    assert resp2.status_code == 200
    body2 = resp2.json()
    assert len(body2["items"]) == 1
    assert body2["next_cursor"] == ""


@pytest.mark.asyncio
async def test_courses_are_isolated_between_tenants(client, mock_db):
    repo = ContentAggregatorRepository(mock_db)
    node = CanonicalNode(
        source_type=SourceType.SUBODHA, source_id="course-1", root_id="course-1", parent_id=None,
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
async def test_unknown_source_returns_404(client, auth_headers):
    resp = await client.get("/content-aggregators/nope/courses", headers=auth_headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
@pytest.mark.parametrize("source", ["subodha", "hexis"])
async def test_start_sync_enqueues_pending_job_for_source(client, mock_db, auth_headers, source):
    resp = await client.post(f"/content-aggregators/{source}/sync", json={"onlyNew": True}, headers=auth_headers)

    assert resp.status_code == 202
    jobs = await ContentAggregatorSyncJobRepository(mock_db).list_jobs("tenant-a", SourceType(source))
    assert [(j.job_id, j.status, j.scope) for j in jobs] == [(resp.json()["job_id"], "pending", "all")]


@pytest.mark.asyncio
async def test_start_sync_rejects_second_active_all_sync_for_same_source(client, auth_headers):
    first = await client.post("/content-aggregators/hexis/sync", json={}, headers=auth_headers)
    second = await client.post("/content-aggregators/hexis/sync", json={}, headers=auth_headers)

    assert first.status_code == 202
    assert second.status_code == 409


@pytest.mark.asyncio
async def test_sync_all_sources_enqueues_one_job_per_push_source(client, mock_db, auth_headers):
    resp = await client.post("/content-aggregators/sync", json={"onlyNew": True}, headers=auth_headers)

    assert resp.status_code == 202
    job_ids = resp.json()["job_ids"]
    assert set(job_ids) == {"subodha"}
    repo = ContentAggregatorSyncJobRepository(mock_db)
    for source, job_id in job_ids.items():
        assert [j.job_id for j in await repo.list_jobs("tenant-a", SourceType(source))] == [job_id]


@pytest.mark.asyncio
async def test_active_jobs_lists_every_source(client, auth_headers):
    await client.post("/content-aggregators/sync", json={}, headers=auth_headers)

    resp = await client.get("/content-aggregators/sync/jobs/active", headers=auth_headers)

    assert {j["source"] for j in resp.json()["jobs"]} == {"subodha"}


@pytest.mark.asyncio
async def test_sync_hexis_course_enqueues_course_job(client, mock_db, auth_headers):
    resp = await client.post("/content-aggregators/hexis/sync/course/3", json={}, headers=auth_headers)

    assert resp.status_code == 202
    jobs = await ContentAggregatorSyncJobRepository(mock_db).list_jobs("tenant-a", SourceType.HEXIS)
    assert [(j.scope, j.source_id) for j in jobs] == [("course", "3")]
