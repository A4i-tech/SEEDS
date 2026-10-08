from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.platform.settings import Settings
from app.services import onboarding_service as onboarding_service_module
from tests.support.mongomock_async import AsyncMongoMockClient

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test"]
    yield db
    await client.close()


@pytest.fixture
async def client(mock_db, monkeypatch):
    async def _override_db():
        return mock_db

    monkeypatch.setattr(onboarding_service_module, "get_settings", lambda: Settings(base_url="https://api.example.com"))
    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()


def _auth() -> dict[str, str]:
    return {"Authorization": f"Bearer {create_access_token({'sub': 'tenant-1', 'role': 'tenant'})}"}


async def _register(client, **body):
    return await client.post("/websites", json={"domain": "apps.acme.com", **body}, headers=_auth())


async def test_register_defaults_normalizes_and_dedupes_additional_domains(client):
    plain = await _register(client)
    assert plain.status_code == 200
    assert plain.json()["additional_domains"] == []

    cleaned = await _register(
        client, domain="apps.other.com", additional_domains=[" LMS.Other.com ", "lms.other.com", "other.com"]
    )
    assert cleaned.json()["additional_domains"] == ["lms.other.com", "other.com"]


async def test_register_rejects_an_invalid_additional_domain_with_422(client):
    response = await _register(client, additional_domains=["not a domain"])

    assert response.status_code == 422


async def test_update_without_additional_domains_keeps_them(client):
    created = (await _register(client, additional_domains=["acme.com"])).json()

    renamed = await client.put(f"/websites/{created['id']}", json={"name": "Renamed"}, headers=_auth())

    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"
    assert renamed.json()["additional_domains"] == ["acme.com"]


async def test_update_rejects_an_invalid_additional_domain_with_422(client):
    created = (await _register(client, additional_domains=["acme.com"])).json()

    response = await client.put(
        f"/websites/{created['id']}", json={"additional_domains": ["not a domain"]}, headers=_auth()
    )

    assert response.status_code == 422
    unchanged = await client.get(f"/websites/{created['id']}", headers=_auth())
    assert unchanged.json()["additional_domains"] == ["acme.com"]


async def test_update_on_a_legacy_website_without_additional_domains_preserves_existing_data(client, mock_db):
    inserted = await mock_db["websites"].insert_one(
        {
            "tenant_id": "tenant-1",
            "domain": "legacy.com",
            "site_id": "site-legacy",
            "status": "Active",
            "name": "",
            "languages": [],
        }
    )

    response = await client.put(f"/websites/{inserted.inserted_id}", json={"name": "Renamed"}, headers=_auth())

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Renamed"
    assert body["domain"] == "legacy.com"
    assert body["site_id"] == "site-legacy"
    assert not body.get("additional_domains")
    stored = await mock_db["websites"].find_one({"_id": inserted.inserted_id})
    assert stored["domain"] == "legacy.com"
    assert stored["site_id"] == "site-legacy"
    assert stored["status"] == "Active"
    assert "additional_domains" not in stored


async def test_update_with_an_explicit_empty_list_clears_additional_domains(client):
    created = (await _register(client, additional_domains=["acme.com"])).json()

    cleared = await client.put(f"/websites/{created['id']}", json={"additional_domains": []}, headers=_auth())

    assert cleared.status_code == 200
    assert cleared.json()["additional_domains"] == []


async def test_update_sets_normalized_additional_domains_and_rejects_conflicts(client):
    first = (await _register(client)).json()
    await _register(client, domain="apps.taken.com", additional_domains=["taken.com"])

    updated = await client.put(f"/websites/{first['id']}", json={"additional_domains": ["ACME.com"]}, headers=_auth())
    conflict = await client.put(f"/websites/{first['id']}", json={"additional_domains": ["taken.com"]}, headers=_auth())

    assert updated.json()["additional_domains"] == ["acme.com"]
    assert conflict.status_code == 409
