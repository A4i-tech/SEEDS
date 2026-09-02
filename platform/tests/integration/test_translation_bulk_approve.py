
from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.translation_repository import TranslationRepository
from tests.support.mongomock_async import AsyncMongoMockClient

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test"]
    yield db
    await client.close()


@pytest.fixture
async def client(mock_db):
    async def _override_db():
        return mock_db

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _token(role: str, user_id: str = "u1") -> str:
    return create_access_token({"sub": user_id, "role": role, "tenant_id": "t1"})


async def _seed(mock_db, langs=("hi",), *, site="site1", route="/h", key="t1"):
    repo = TranslationRepository(mock_db)
    await repo.upsert_source(site, route, key, "en", "Hello")
    for lang in langs:
        await repo.save_translation(site, route, key, lang, f"[{lang}] Hello", "P")
    return repo


async def test_bulk_approve_requires_auth(client):
    resp = await client.post("/translations/bulk-approve?siteId=site1", json={})
    assert resp.status_code == 401


async def test_bulk_approve_forbidden_for_teacher(client, mock_db):
    repo = await _seed(mock_db)
    resp = await client.post(
        "/translations/bulk-approve?siteId=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('teacher')}"},
    )
    assert resp.status_code == 403
    doc = (await repo.find_by_route("site1", "/h"))[0]
    assert doc["translations"]["hi"]["status"] == "pending"


async def test_bulk_approve_allows_reviewer_and_approves(client, mock_db):
    repo = await _seed(mock_db)
    resp = await client.post(
        "/translations/bulk-approve?siteId=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('reviewer')}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"approved": 1, "skipped": 0}
    doc = (await repo.find_by_route("site1", "/h"))[0]
    assert doc["translations"]["hi"]["status"] == "approved"


async def test_bulk_approve_allows_admin(client, mock_db):
    await _seed(mock_db)
    resp = await client.post(
        "/translations/bulk-approve?siteId=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('admin')}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"approved": 1, "skipped": 0}


async def test_bulk_approve_allows_tenant(client, mock_db):
    await _seed(mock_db)
    resp = await client.post(
        "/translations/bulk-approve?siteId=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('tenant')}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"approved": 1, "skipped": 0}


async def test_bulk_approve_allows_school_admin(client, mock_db):
    await _seed(mock_db)
    resp = await client.post(
        "/translations/bulk-approve?siteId=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('school_admin')}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"approved": 1, "skipped": 0}


async def test_bulk_approve_allows_content_creator(client, mock_db):
    await _seed(mock_db)
    resp = await client.post(
        "/translations/bulk-approve?siteId=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('content_creator')}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"approved": 1, "skipped": 0}


async def test_bulk_approve_forbidden_for_other_roles(client, mock_db):
    repo = await _seed(mock_db)
    for role in ("student",):
        resp = await client.post(
            "/translations/bulk-approve?siteId=site1",
            json={},
            headers={"Authorization": f"Bearer {_token(role)}"},
        )
        assert resp.status_code == 403, role
    doc = (await repo.find_by_route("site1", "/h"))[0]
    assert doc["translations"]["hi"]["status"] == "pending"


async def test_bulk_approve_lang_scope_only_approves_requested_language(client, mock_db):
    repo = await _seed(mock_db, langs=("hi", "mr"))
    resp = await client.post(
        "/translations/bulk-approve?siteId=site1",
        json={"lang": "hi"},
        headers={"Authorization": f"Bearer {_token('reviewer')}"},
    )
    assert resp.status_code == 200
    assert resp.json() == {"approved": 1, "skipped": 0}
    doc = (await repo.find_by_route("site1", "/h"))[0]
    assert doc["translations"]["hi"]["status"] == "approved"
    assert doc["translations"]["mr"]["status"] == "pending"
