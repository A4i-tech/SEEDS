from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.content_aggregator import IntegrationClient, IntegrationClientStatus
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.providers.blob_storage import get_blob_storage_provider
from app.repositories.integration_client_repository import IntegrationClientRepository


@pytest_asyncio.fixture
async def mock_db():
    from tests.support.mongomock_async import AsyncMongoMockClient

    mongo_client = AsyncMongoMockClient()
    db = mongo_client["seeds_test_content_aggregator_content"]
    yield db
    await mongo_client.close()


class _FakeBlob:
    async def upload_file(self, container, blob_name, data, content_type="application/octet-stream"):
        return f"https://blob.test/{container}/{blob_name}"

    async def download_from_url(self, url: str) -> bytes:
        return b"raw-bytes"

    async def get_upload_sas_url(self, container: str, blob_name: str, expiry_hours: int = 1) -> str:
        return f"https://blob.test/{container}/{blob_name}?sas=1"


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_blob_storage_provider] = lambda: _FakeBlob()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _seed_client(mock_db, *, client_id="client-1", secret="s3cret", scopes=None, tenant_ids=None):
    repo = IntegrationClientRepository(mock_db)
    await repo.create(
        IntegrationClient(
            client_id=client_id,
            client_secret_hash=hash_password(secret),
            name="acme",
            tenant_ids=tenant_ids or ["tenant-a"],
            allowed_scopes=scopes or ["content:read", "content:write", "content:delete"],
            status=IntegrationClientStatus.ACTIVE,
            created_at=datetime.now(UTC),
        )
    )


async def _auth_headers(client, mock_db, *, client_id="client-1", secret="s3cret", scope="content:read content:write content:delete", tenant_id="tenant-a") -> dict:
    resp = await client.post("/v1/auth/token", json={"client_id": client_id, "client_secret": secret, "scope": scope})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "x-tenant-ids": tenant_id}


@pytest.mark.asyncio
async def test_post_content_notes_happy_path(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)

    resp = await client.post(
        "/v1/content",
        headers={**headers, "Idempotency-Key": "note-1"},
        json={"type": "notes", "language": "en", "display_name": "My Notes", "text": "hello"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert body[0]["source_id"] == "note-1"
    assert body[0]["item_type"] == "plaintext"


@pytest.mark.asyncio
async def test_post_content_repeated_idempotency_key_upserts(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)

    await client.post(
        "/v1/content", headers={**headers, "Idempotency-Key": "note-1"},
        json={"type": "notes", "language": "en", "display_name": "v1", "text": "hello"},
    )
    await client.post(
        "/v1/content", headers={**headers, "Idempotency-Key": "note-1"},
        json={"type": "notes", "language": "en", "display_name": "v2", "text": "world"},
    )
    listed = await client.get("/v1/content", headers=headers)
    assert len(listed.json()) == 1
    assert listed.json()[0]["display_name"] == "v2"


@pytest.mark.asyncio
async def test_post_content_unsupported_type(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    resp = await client.post(
        "/v1/content", headers={**headers, "Idempotency-Key": "x-1"},
        json={"type": "video", "language": "en", "display_name": "X"},
    )
    assert resp.status_code == 400
    assert resp.json()["code"] == "UNSUPPORTED_TYPE"


@pytest.mark.asyncio
async def test_post_content_wrong_tenant_header_forbidden(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    headers["x-tenant-ids"] = "tenant-z"
    resp = await client.post(
        "/v1/content", headers={**headers, "Idempotency-Key": "x-1"},
        json={"type": "notes", "language": "en", "display_name": "X", "text": "hi"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "TENANT_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_post_content_insufficient_scope(client, mock_db):
    await _seed_client(mock_db, scopes=["content:read"])
    headers = await _auth_headers(client, mock_db, scope="content:read")
    resp = await client.post(
        "/v1/content", headers={**headers, "Idempotency-Key": "x-1"},
        json={"type": "notes", "language": "en", "display_name": "X", "text": "hi"},
    )
    assert resp.status_code == 403
    assert resp.json()["code"] == "SCOPE_INSUFFICIENT"


@pytest.mark.asyncio
async def test_get_content_by_id(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await client.post(
        "/v1/content", headers={**headers, "Idempotency-Key": "note-1"},
        json={"type": "notes", "language": "en", "display_name": "My Notes", "text": "hello"},
    )
    resp = await client.get("/v1/content/note-1", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["source_id"] == "note-1"


@pytest.mark.asyncio
async def test_get_content_by_id_not_found_for_other_client(client, mock_db):
    await _seed_client(mock_db, client_id="client-1")
    await _seed_client(mock_db, client_id="client-2", secret="other-secret")
    headers1 = await _auth_headers(client, mock_db, client_id="client-1", secret="s3cret")
    await client.post(
        "/v1/content", headers={**headers1, "Idempotency-Key": "note-1"},
        json={"type": "notes", "language": "en", "display_name": "My Notes", "text": "hello"},
    )
    headers2 = await _auth_headers(client, mock_db, client_id="client-2", secret="other-secret")
    resp = await client.get("/v1/content/note-1", headers=headers2)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_content_status(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await client.post(
        "/v1/content", headers={**headers, "Idempotency-Key": "note-1"},
        json={"type": "notes", "language": "en", "display_name": "My Notes", "text": "hello"},
    )
    resp = await client.get("/v1/content-status/note-1", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == {"status": "completed"}


@pytest.mark.asyncio
async def test_get_content_status_not_found(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    resp = await client.get("/v1/content-status/missing", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_patch_content_updates_content(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await client.post(
        "/v1/content", headers={**headers, "Idempotency-Key": "note-1"},
        json={"type": "notes", "language": "en", "display_name": "My Notes", "text": "hello"},
    )
    resp = await client.patch(
        "/v1/content/note-1", headers=headers, json={"content": {"markdown_url": "https://blob.test/x.txt"}}
    )
    assert resp.status_code == 200
    assert resp.json()["content"]["markdown_url"] == "https://blob.test/x.txt"


@pytest.mark.asyncio
async def test_delete_content_then_get_404(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await client.post(
        "/v1/content", headers={**headers, "Idempotency-Key": "note-1"},
        json={"type": "notes", "language": "en", "display_name": "My Notes", "text": "hello"},
    )
    del_resp = await client.delete("/v1/content/note-1", headers=headers)
    assert del_resp.status_code == 204

    get_resp = await client.get("/v1/content/note-1", headers=headers)
    assert get_resp.status_code == 404


@pytest.mark.asyncio
async def test_get_upload_url(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    resp = await client.get("/v1/content/upload-url", headers=headers, params={"blob_name": "story.mp3"})
    assert resp.status_code == 200
    assert "sas_token" in resp.json() or "sas_url" in resp.json()
