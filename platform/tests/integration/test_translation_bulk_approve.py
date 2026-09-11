
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


