from __future__ import annotations

from datetime import UTC, datetime

import pytest
import pytest_asyncio
from bson import ObjectId
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.content_aggregator import IntegrationClient, IntegrationClientStatus
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.providers.blob_storage import get_blob_storage_provider
from app.repositories.integration_client_repository import IntegrationClientRepository
from tests.support.fake_blob import FakeBlob
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"


@pytest_asyncio.fixture
async def mock_db():
    mongo_client = AsyncMongoMockClient()
    db = mongo_client["seeds_test_content_aggregator_content"]
    yield db
    await mongo_client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    app.dependency_overrides[get_blob_storage_provider] = lambda: FakeBlob()
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
            tenant_ids=tenant_ids or [TENANT],
            allowed_scopes=scopes or ["content:read", "content:write", "content:delete"],
            status=IntegrationClientStatus.ACTIVE,
            created_at=datetime.now(UTC),
        )
    )


async def _auth_headers(client, mock_db, *, client_id="client-1", secret="s3cret", scope="content:read content:write content:delete", tenant_id=TENANT) -> dict:
    resp = await client.post("/v1/auth/token", json={"client_id": client_id, "client_secret": secret, "scope": scope})
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}", "x-tenant-ids": tenant_id}


_BODY = {
    "type": "story",
    "language": "en",
    "title": {"english": "My Story"},
    "theme": {"english": "Families"},
    "description": "hello",
    "audio_content": [{"audio_url": "https://x.example/a.mp3"}],
    "is_teacher_app": True,
}


@pytest.mark.asyncio
async def test_post_content_happy_path(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)

    resp = await client.post("/v1/content", headers={**headers, "Idempotency-Key": "note-1"}, json=_BODY)
    assert resp.status_code == 200
    assert resp.json() == {"jobs": {TENANT: "note-1"}}

    doc = await mock_db["contentAggregators"].find_one({"tenant_id": TENANT, "content_id": "note-1"})
    assert doc["created_by"] == "client-1"
    assert doc["title"]["english"] == "My Story"


@pytest.mark.asyncio
async def test_post_content_fans_out_per_tenant(client, mock_db):
    await _seed_client(mock_db, tenant_ids=[TENANT, "69660fae7fccd4ee129e58af"])
    headers = await _auth_headers(client, mock_db, tenant_id=f"{TENANT},69660fae7fccd4ee129e58af")

    resp = await client.post("/v1/content", headers={**headers, "Idempotency-Key": "multi"}, json=_BODY)
    assert resp.status_code == 200
    assert resp.json() == {"jobs": {TENANT: "multi", "69660fae7fccd4ee129e58af": "multi"}}


@pytest.mark.asyncio
async def test_post_content_repeated_idempotency_key_upserts(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)

    await client.post("/v1/content", headers={**headers, "Idempotency-Key": "note-1"}, json=_BODY)
    await client.post("/v1/content", headers={**headers, "Idempotency-Key": "note-1"}, json={**_BODY, "description": "v2"})

    assert await mock_db["contentAggregators"].count_documents({"tenant_id": TENANT, "content_id": "note-1"}) == 1
    listed = await client.get("/v1/content", headers=headers)
    assert listed.json()["data"][0]["description"] == "v2"


@pytest.mark.asyncio
async def test_post_content_unsupported_language(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    resp = await client.post("/v1/content", headers={**headers, "Idempotency-Key": "x-1"}, json={**_BODY, "language": "xx"})
    assert resp.status_code == 400
    assert resp.json()["code"] == "UNSUPPORTED_LANGUAGE"


@pytest.mark.asyncio
async def test_post_content_wrong_tenant_header_forbidden(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    headers["x-tenant-ids"] = "69660fae7fccd4ee129e58af"
    resp = await client.post("/v1/content", headers={**headers, "Idempotency-Key": "x-1"}, json=_BODY)
    assert resp.status_code == 403
    assert resp.json()["code"] == "TENANT_NOT_ALLOWED"


@pytest.mark.asyncio
async def test_post_content_insufficient_scope(client, mock_db):
    await _seed_client(mock_db, scopes=["content:read"])
    headers = await _auth_headers(client, mock_db, scope="content:read")
    resp = await client.post("/v1/content", headers={**headers, "Idempotency-Key": "x-1"}, json=_BODY)
    assert resp.status_code == 403
    assert resp.json()["code"] == "SCOPE_INSUFFICIENT"


@pytest.mark.asyncio
async def test_get_content_by_id_reads_partner_doc(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await client.post("/v1/content", headers={**headers, "Idempotency-Key": "note-1"}, json=_BODY)

    resp = await client.get("/v1/content/note-1", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["content_id"] == "note-1"
    assert body["title"]["english"] == "My Story"
    assert body["audio_content"][0]["audio_url"] == "https://x.example/a.mp3"


@pytest.mark.asyncio
async def test_get_content_by_id_reads_own_contents_v3(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await mock_db["contentsV3"].insert_one({
        "tenant_id": ObjectId(TENANT),
        "content_id": "own-1",
        "type": "song",
        "language": "kn",
        "title": {"english": "Own Song", "local": "", "audio_url": ""},
    })

    resp = await client.get("/v1/content/own-1", headers=headers)
    assert resp.status_code == 200
    assert resp.json()["type"] == "song"


@pytest.mark.asyncio
async def test_get_content_by_id_not_found(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    resp = await client.get("/v1/content/missing", headers=headers)
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_get_content_status(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await client.post("/v1/content", headers={**headers, "Idempotency-Key": "note-1"}, json=_BODY)
    resp = await client.get("/v1/content-status/note-1", headers=headers)
    assert resp.status_code == 200
    assert resp.json() == {"status": "completed"}


@pytest.mark.asyncio
async def test_list_content_returns_page_shape(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await client.post("/v1/content", headers={**headers, "Idempotency-Key": "note-1"}, json=_BODY)

    resp = await client.get("/v1/content", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert [d["content_id"] for d in body["data"]] == ["note-1"]
    assert body["pagination"] == {"nextCursor": None, "hasMore": False, "limit": 15}


@pytest.mark.asyncio
async def test_list_content_paginates(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    for i in range(3):
        await mock_db["contentAggregators"].insert_one({
            "tenant_id": TENANT,
            "content_id": f"c{i}",
            "type": "story",
            "language": "en",
            "creation_time": 10 - i,
            "is_deleted": False,
        })

    first = await client.get("/v1/content?limit=2", headers=headers)
    assert [d["content_id"] for d in first.json()["data"]] == ["c0", "c1"]
    cursor = first.json()["pagination"]["nextCursor"]
    assert first.json()["pagination"]["hasMore"] is True

    second = await client.get(f"/v1/content?limit=2&cursor={cursor}", headers=headers)
    assert [d["content_id"] for d in second.json()["data"]] == ["c2"]
    assert second.json()["pagination"]["hasMore"] is False


@pytest.mark.asyncio
async def test_patch_content_updates_fields(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await client.post("/v1/content", headers={**headers, "Idempotency-Key": "note-1"}, json=_BODY)

    resp = await client.patch("/v1/content/note-1", headers=headers, json={"description": "updated", "is_teacher_app": False})
    assert resp.status_code == 200
    assert resp.json()["description"] == "updated"


@pytest.mark.asyncio
async def test_patch_content_is_audio_uploaded_enqueues_job(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await client.post("/v1/content", headers={**headers, "Idempotency-Key": "note-1"}, json=_BODY)

    resp = await client.patch("/v1/content/note-1?isAudioUploaded=true", headers=headers, json={"description": "x"})
    assert resp.status_code == 200
    assert resp.json()["job_id"]
    assert await mock_db["content_jobs"].count_documents({"content_id": "note-1"}) == 1


@pytest.mark.asyncio
async def test_patch_content_not_found(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    resp = await client.patch("/v1/content/missing", headers=headers, json={"description": "x"})
    assert resp.status_code == 404


@pytest.mark.asyncio
async def test_delete_content_then_get_404(client, mock_db):
    await _seed_client(mock_db)
    headers = await _auth_headers(client, mock_db)
    await client.post("/v1/content", headers={**headers, "Idempotency-Key": "note-1"}, json=_BODY)

    del_resp = await client.delete("/v1/content/note-1", headers=headers)
    assert del_resp.status_code == 200
    assert del_resp.json() == {"acknowledged": True, "matchedCount": 1, "modifiedCount": 1}

    get_resp = await client.get("/v1/content/note-1", headers=headers)
    assert get_resp.status_code == 404
