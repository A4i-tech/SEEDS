from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.aggregators.sync_job_models import SyncItemResult
from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)


@pytest_asyncio.fixture
async def mock_db():
    from tests.support.mongomock_async import AsyncMongoMockClient

    mongo_client = AsyncMongoMockClient()
    db = mongo_client["seeds_test_content_aggregator_extra"]
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
    token = create_access_token({"sub": tenant_id, "role": "tenant", "tenant_id": tenant_id})
    return {"Authorization": f"Bearer {token}"}


def _role_headers(role: str, tenant_id: str = "tenant-a") -> dict[str, str]:
    token = create_access_token({"sub": tenant_id, "role": role, "tenant_id": tenant_id})
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def auth_headers():
    return _tenant_headers("tenant-a")


@pytest.mark.asyncio
async def test_start_sync_all_conflict_when_active_job_exists(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-a", source_type="all", scope="all", source_id=None, total_items=0)

    resp = await client.post("/content-aggregators/sync", headers=auth_headers)
    assert resp.status_code == 409
    assert resp.json()["code"] == "CONFLICT"


@pytest.mark.asyncio
async def test_start_sync_all_forbidden_for_student_role(client, mock_db):
    resp = await client.post("/content-aggregators/sync", headers=_role_headers("student"))
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_sync_job_items_returns_paginated_items(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    item_repo = ContentAggregatorSyncJobItemRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="all", source_id=None, total_items=1)
    await item_repo.insert("tenant-a", "job-1", SyncItemResult(source_id="c-1", name="Course 1", status="synced", error=None, at="2024-01-01T00:00:00Z"))

    resp = await client.get("/content-aggregators/sync/status/job-1/items", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body["items"]) == 1
    assert body["items"][0]["source_id"] == "c-1"
    assert body["total"] == 1


@pytest.mark.asyncio
async def test_sync_job_items_404_for_unknown_job(client, auth_headers, mock_db):
    resp = await client.get("/content-aggregators/sync/status/no-such-job/items", headers=auth_headers)
    assert resp.status_code == 404
    assert resp.json()["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_delete_course_forbidden_for_non_tenant_role(client, mock_db):
    resp = await client.delete("/content-aggregators/subodha/courses/course-1", headers=_role_headers("school_admin"))
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_delete_course_unknown_source_404(client, auth_headers):
    resp = await client.delete("/content-aggregators/nope/courses/course-1", headers=auth_headers)
    assert resp.status_code == 404
    assert resp.json()["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_delete_course_happy_path_then_404_on_second_delete(client, auth_headers, mock_db):
    from app.aggregators.models import CanonicalNode, NodeKind
    from app.repositories.content_aggregator_repository import ContentAggregatorRepository

    repo = ContentAggregatorRepository(mock_db)
    node = CanonicalNode(
        tenant_id="tenant-a",
        source_type="subodha",
        source_id="course-1",
        root_id="course-1",
        node_kind=NodeKind.CONTAINER,
        native_type="course",
        parent_id=None,
        order=0,
        item_type=None,
        display_name="A course",
        content=None,
        lms_url=None,
        source_metadata={},
        last_run_id="run-1",
        fetched_at="x",
        created_at="x",
        updated_at="x",
    )
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [node])

    resp = await client.delete("/content-aggregators/subodha/courses/course-1", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json() == {"deleted": 1}

    resp = await client.delete("/content-aggregators/subodha/courses/course-1", headers=auth_headers)
    assert resp.status_code == 404
    assert resp.json()["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_update_problem_block_forbidden_for_non_tenant_role(client, mock_db):
    resp = await client.patch(
        "/content-aggregators/subodha/courses/course-1/blocks/block-1",
        json={"question": "x", "choices": []},
        headers=_role_headers("teacher"),
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "FORBIDDEN"


@pytest.mark.asyncio
async def test_update_problem_block_404_for_unknown_block(client, auth_headers):
    resp = await client.patch(
        "/content-aggregators/subodha/courses/course-1/blocks/no-such-block",
        json={"question": "x", "choices": []},
        headers=auth_headers,
    )
    assert resp.status_code == 404
    assert resp.json()["code"] == "NOT_FOUND"


@pytest.mark.asyncio
async def test_sync_course_conflict_when_active_job_exists(client, auth_headers, mock_db):
    job_repo = ContentAggregatorSyncJobRepository(mock_db)
    await job_repo.create_job("job-1", tenant_id="tenant-a", source_type="subodha", scope="course", source_id="course-1", total_items=0)

    resp = await client.post("/content-aggregators/subodha/sync/course/course-1", headers=auth_headers)
    assert resp.status_code == 409
    assert resp.json()["code"] == "CONFLICT"


@pytest.mark.asyncio
async def test_sync_course_unknown_source_404(client, auth_headers):
    resp = await client.post("/content-aggregators/nope/sync/course/course-1", headers=auth_headers)
    assert resp.status_code == 404
    assert resp.json()["code"] == "NOT_FOUND"
