
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
    resp = await client.post("/translations/bulk-approve?site_id=site1", json={})
    assert resp.status_code == 401


async def test_bulk_approve_allows_tenant_role(client, mock_db):
    from app.repositories.website_repository import WebsiteRepository

    await WebsiteRepository.ensure_indexes(mock_db)
    await WebsiteRepository(mock_db).create("t1", None, "acme.com", "site1")
    await _seed(mock_db)

    resp = await client.post(
        "/translations/bulk-approve?site_id=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('tenant', user_id='t1')}"},
    )
    assert resp.status_code == 200


async def test_bulk_approve_forbids_school_admin_role(client):
    resp = await client.post(
        "/translations/bulk-approve?site_id=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('school_admin')}"},
    )
    assert resp.status_code == 403


async def test_bulk_approve_denies_a_different_tenants_site(client, mock_db):
    from app.repositories.website_repository import WebsiteRepository

    await WebsiteRepository.ensure_indexes(mock_db)
    await WebsiteRepository(mock_db).create("t1", None, "acme.com", "site1")
    await _seed(mock_db)

    resp = await client.post(
        "/translations/bulk-approve?site_id=site1",
        json={},
        headers={"Authorization": f"Bearer {_token('tenant', user_id='t2')}"},
    )
    assert resp.status_code == 404


