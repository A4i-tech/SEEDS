from __future__ import annotations

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.services.language_registry import SUPPORTED_LANGUAGES


@pytest_asyncio.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac


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
        assert entry["standard"] in ("ISO 639-1", "ISO 639-3")
        assert entry["name"]


@pytest.mark.asyncio
async def test_list_languages_iso_639_3_fallback_codes(client):
    resp = await client.get("/v1/languages")
    by_code = {e["code"]: e for e in resp.json()["languages"]}
    assert by_code["kok"]["standard"] == "ISO 639-3"
    assert by_code["brx"]["standard"] == "ISO 639-3"
    for code in ("kn", "hi", "en", "ta", "te", "mr"):
        assert by_code[code]["standard"] == "ISO 639-1"
