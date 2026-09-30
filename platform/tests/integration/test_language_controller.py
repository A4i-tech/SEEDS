from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.platform import database as database_module
from app.repositories.website_repository import WebsiteRepository
from app.services.language_registry import SUPPORTED_LANGUAGES
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


@pytest_asyncio.fixture
async def mock_db(monkeypatch):
    db = AsyncMongoMockClient()["test_seeds"]
    monkeypatch.setattr(database_module, "get_database", lambda: db)
    from app.controllers import language_controller

    monkeypatch.setattr(language_controller, "get_database", lambda: db)
    return db


@pytest.mark.asyncio
async def test_list_languages_returns_supported_registry(client):
    resp = await client.get("/v1/languages")
    assert resp.status_code == 200
    body = resp.json()
    assert body == {"languages": list(SUPPORTED_LANGUAGES)}


@pytest.mark.asyncio
async def test_list_languages_entries_have_code_and_name(client):
    resp = await client.get("/v1/languages")
    for entry in resp.json()["languages"]:
        assert entry["code"]
        assert entry["standard"] == "ISO 639-1"
        assert entry["name"]


@pytest.mark.asyncio
async def test_list_languages_covers_iso_639_1_universe(client):
    resp = await client.get("/v1/languages")
    by_code = {e["code"]: e["name"] for e in resp.json()["languages"]}
    assert len(by_code) > 150
    assert by_code["kn"] == "Kannada"
    assert by_code["hi"] == "Hindi"
    assert by_code["en"] == "English"
    assert by_code["ta"] == "Tamil"
    assert by_code["te"] == "Telugu"
    assert by_code["mr"] == "Marathi"


@pytest.mark.asyncio
async def test_site_scoped_languages_returns_only_that_sites_enabled_languages(client, mock_db):
    await WebsiteRepository.ensure_indexes(mock_db)
    await WebsiteRepository(mock_db).create(
        "tenant-1",
        None,
        "acme.com",
        "site-acme",
        languages=[{"code": "hi", "enabled": True}, {"code": "ta", "enabled": False}],
    )
    await WebsiteRepository(mock_db).create(
        "tenant-1", None, "other.com", "site-other", languages=[{"code": "bn", "enabled": True}]
    )

    resp = await client.get("/v1/languages", params={"site_id": "site-acme"})
    assert resp.status_code == 200
    codes = {entry["code"] for entry in resp.json()["languages"]}
    assert codes == {"hi"}


@pytest.mark.asyncio
async def test_site_scoped_languages_is_empty_for_unknown_site(client, mock_db):
    resp = await client.get("/v1/languages", params={"site_id": "does-not-exist"})
    assert resp.status_code == 200
    assert resp.json()["languages"] == []
