from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.content_aggregator import IntegrationClient, IntegrationClientStatus
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.repositories.integration_client_repository import IntegrationClientRepository


@pytest_asyncio.fixture
async def mock_db():
    from tests.support.mongomock_async import AsyncMongoMockClient

    mongo_client = AsyncMongoMockClient()
    db = mongo_client["seeds_test_content_aggregator_auth"]
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


async def _register(client, tenant_ids=None, scopes=None) -> dict:
    resp = await client.post(
        "/v1/auth/register",
        json={"name": "acme-lms", "tenant_ids": tenant_ids or ["tenant-a"], "scopes": scopes or ["sync:read", "sync:write"]},
    )
    assert resp.status_code == 200
    return resp.json()


async def _seed_client(mock_db, *, client_id, secret, scopes, status=IntegrationClientStatus.ACTIVE, tenant_ids=None):

    repo = IntegrationClientRepository(mock_db)
    await repo.create(
        IntegrationClient(
            client_id=client_id,
            client_secret_hash=hash_password(secret),
            name="seeded",
            tenant_ids=tenant_ids or ["tenant-a"],
            allowed_scopes=scopes,
            status=status,
            created_at=datetime.now(UTC),
        )
    )


@pytest.mark.asyncio
async def test_register_client_happy_path(client):
    body = await _register(client)
    assert body["client_id"]
    assert body["client_secret"]
    assert body["tenant_ids"] == ["tenant-a"]
    assert body["allowed_scopes"] == ["sync:read", "sync:write"]


@pytest.mark.asyncio
async def test_issue_token_happy_path(client):
    reg = await _register(client)
    resp = await client.post(
        "/v1/auth/token",
        json={"client_id": reg["client_id"], "client_secret": reg["client_secret"], "scope": "sync:read"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"]
    assert body["token_type"] == "Bearer"
    assert body["scope"] == "sync:read"


@pytest.mark.asyncio
async def test_issue_token_unknown_client_id(client):
    resp = await client.post(
        "/v1/auth/token",
        json={"client_id": "nope", "client_secret": "whatever", "scope": "sync:read"},
    )
    assert resp.status_code == 401
    assert resp.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_issue_token_wrong_secret(client):
    reg = await _register(client)
    resp = await client.post(
        "/v1/auth/token",
        json={"client_id": reg["client_id"], "client_secret": "wrong-secret", "scope": "sync:read"},
    )
    assert resp.status_code == 401
    assert resp.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_issue_token_scope_exceeds_allowed(client):
    reg = await _register(client, scopes=["sync:read"])
    resp = await client.post(
        "/v1/auth/token",
        json={"client_id": reg["client_id"], "client_secret": reg["client_secret"], "scope": "sync:read sync:write"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "SCOPE_INSUFFICIENT"


@pytest.mark.asyncio
async def test_issue_token_inactive_client(client, mock_db):
    await _seed_client(mock_db, client_id="c-disabled", secret="s3cret", scopes=["sync:read"], status=IntegrationClientStatus.DISABLED)
    resp = await client.post(
        "/v1/auth/token",
        json={"client_id": "c-disabled", "client_secret": "s3cret", "scope": "sync:read"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "TENANT_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_refresh_token_happy_path(client):
    reg = await _register(client)
    issued = (
        await client.post(
            "/v1/auth/token",
            json={"client_id": reg["client_id"], "client_secret": reg["client_secret"], "scope": "sync:read"},
        )
    ).json()
    resp = await client.post("/v1/auth/token/refresh", json={"refresh_token": issued["refresh_token"]})
    assert resp.status_code == 200
    body = resp.json()
    assert body["access_token"]
    assert body["refresh_token"] != issued["refresh_token"]


@pytest.mark.asyncio
async def test_refresh_token_invalid(client):
    resp = await client.post("/v1/auth/token/refresh", json={"refresh_token": "garbage"})
    assert resp.status_code == 401
    assert resp.json()["code"] == "UNAUTHORIZED"


@pytest.mark.asyncio
async def test_refresh_token_reuse_revokes_all_tokens(client):
    reg = await _register(client)
    issued = (
        await client.post(
            "/v1/auth/token",
            json={"client_id": reg["client_id"], "client_secret": reg["client_secret"], "scope": "sync:read"},
        )
    ).json()
    rotated = (
        await client.post("/v1/auth/token/refresh", json={"refresh_token": issued["refresh_token"]})
    ).json()

    reuse = await client.post("/v1/auth/token/refresh", json={"refresh_token": issued["refresh_token"]})
    assert reuse.status_code == 401
    assert reuse.json()["code"] == "UNAUTHORIZED"

    locked_out = await client.post("/v1/auth/token/refresh", json={"refresh_token": rotated["refresh_token"]})
    assert locked_out.status_code == 401


@pytest.mark.asyncio
async def test_refresh_token_inactive_client(client, mock_db):
    reg = await _register(client)
    issued = (
        await client.post(
            "/v1/auth/token",
            json={"client_id": reg["client_id"], "client_secret": reg["client_secret"], "scope": "sync:read"},
        )
    ).json()

    await mock_db["integrationClients"].update_one({"client_id": reg["client_id"]}, {"$set": {"status": "disabled"}})

    resp = await client.post("/v1/auth/token/refresh", json={"refresh_token": issued["refresh_token"]})
    assert resp.status_code == 403
    assert resp.json()["code"] == "TENANT_NOT_ALLOWED"
