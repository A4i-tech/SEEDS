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
        client, domain=" Apps.Other.COM ", additional_domains=[" LMS.Other.com ", "lms.other.com", "other.com"]
    )
    assert cleaned.json()["domain"] == "apps.other.com"
    assert sorted(cleaned.json()["additional_domains"]) == ["lms.other.com", "other.com"]


async def test_update_additional_domains_semantics(client):
    created = (await _register(client, additional_domains=["acme.com", "lms.acme.com"])).json()
    url = f"/websites/{created['id']}"

    renamed = await client.put(url, json={"name": "Renamed"}, headers=_auth())
    assert renamed.status_code == 200
    assert sorted(renamed.json()["additional_domains"]) == ["acme.com", "lms.acme.com"]

    nulled = await client.put(url, json={"additional_domains": None}, headers=_auth())
    assert sorted(nulled.json()["additional_domains"]) == ["acme.com", "lms.acme.com"]

    replaced = await client.put(url, json={"additional_domains": [" NEW.Acme.com ", "new.acme.com", "Other.com"]}, headers=_auth())
    assert sorted(replaced.json()["additional_domains"]) == ["new.acme.com", "other.com"]

    cleared = await client.put(url, json={"additional_domains": []}, headers=_auth())
    assert cleared.status_code == 200
    assert cleared.json()["additional_domains"] == []


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
    assert "additional_domains" not in stored
