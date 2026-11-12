from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime
from types import SimpleNamespace
from unittest.mock import AsyncMock

import httpx
import pytest
from bson import ObjectId
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from pymongo.errors import DuplicateKeyError

from app.controllers.device_push_controller import router
from app.models.device_push import DevicePushRecord
from app.models.requests.device_push_requests import DevicePushCallback, DevicePushRequest
from app.platform.auth.dependencies import get_current_user, get_db
from app.platform.error_handling import NotFoundError, register_error_handlers
from app.providers.vembi_client import VembiClient, get_vembi_client
from app.repositories.device_push_repository import DevicePushRepository
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"
OTHER_TENANT = "69660fae7fccd4ee129e58af"
SECRET = "callback-secret"
WAV = "https://acct.blob.core.windows.net/output-container/a.wav"
SAS = WAV + "?sig=secret-token"


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
def settings(monkeypatch):
    fake = SimpleNamespace(
        vembi_base_url="https://vembi.test",
        vembi_api_key="key",
        vembi_callback_secret=SECRET,
        vembi_timeout_seconds=10,
        vembi_pushes_collection_name="devicePushes",
    )
    for module in (
        "app.services.device_push_service",
        "app.providers.vembi_client",
        "app.repositories.device_push_repository",
    ):
        monkeypatch.setattr(f"{module}.get_settings", lambda: fake)
    return fake


@pytest.fixture
def blob(monkeypatch):
    provider = SimpleNamespace(get_sas_url_from_blob_url=AsyncMock(return_value=SAS))
    monkeypatch.setattr("app.services.device_push_service.get_blob_storage_provider", lambda: provider)
    return provider


def _vembi(handler) -> VembiClient:
    return VembiClient(httpx.AsyncClient(base_url="https://vembi.test", transport=httpx.MockTransport(handler)))


@pytest.fixture
def vembi_calls():
    calls = type("Calls", (list,), {})()

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(request)
        if request.method == "POST":
            return httpx.Response(200, json={"source_id": "src-1", "status": "PROCESSING"})
        return httpx.Response(
            200, json={"source_id": "src-1", "status": "DELIVERED", "last_synced_at": "2026-11-12T11:29:14+05:30"}
        )

    calls.client = _vembi(handler)
    return calls


async def _content(db, **overrides):
    doc = {
        "_id": ObjectId(),
        "tenant_id": ObjectId(TENANT),
        "type": "story",
        "language": "kn",
        "title": {"english": "Mina Quest", "local": "", "audio_url": ""},
        "audio_content": [{"audio_url": WAV, "duration_seconds": 12.5}],
        "text_file_url": "https://acct.blob.core.windows.net/texts/a.txt",
        "is_processed": True,
        "is_deleted": False,
    }
    doc.update(overrides)
    await db["contentsV3"].insert_one(doc)
    return str(doc["_id"])


def _sign(body: bytes, secret: str = SECRET) -> str:
    return "sha256=" + hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


@pytest.fixture
def user():
    return {"tenant_id": TENANT, "role": "teacher"}


@pytest.fixture
async def client(db, user, settings, blob, vembi_calls):
    app = FastAPI()
    register_error_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    app.dependency_overrides[get_vembi_client] = lambda: vembi_calls.client
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


async def _push(client, content_id, device_type="iris", device_id="2000"):
    return await client.post(
        "/devices/push", json={"content_id": content_id, "device_id": device_id, "device_type": device_type}
    )


def test_request_models_validate():
    DevicePushRequest(content_id="a" * 24, device_id="1", device_type="iris")
    with pytest.raises(ValueError):
        DevicePushRequest(content_id="a" * 24, device_id="1", device_type="tablet")
    with pytest.raises(ValueError):
        DevicePushRequest(device_id="1", device_type="iris")
    with pytest.raises(ValueError):
        DevicePushCallback(source_id="s", status="SYNCED")


async def test_vembi_client_push_and_status(settings):
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"source_id": "s1", "status": "PROCESSING"})

    client = _vembi(handler)
    reply = await client.push("2000", "iris", SAS, "kn", "T", "story")

    assert reply.source_id == "s1"
    assert json.loads(seen[0].content) == {
        "device_id": "2000",
        "device_type": "iris",
        "file_url": SAS,
        "language": "kn",
        "title": "T",
        "folder": "story",
    }


async def test_vembi_client_errors(settings):
    failing = _vembi(lambda r: httpx.Response(500))
    with pytest.raises(httpx.HTTPStatusError):
        await failing.push("1", "iris", SAS, "kn", "T", "story")
    missing = _vembi(lambda r: httpx.Response(404))
    with pytest.raises(NotFoundError):
        await missing.get_status("nope")


async def test_repository_roundtrip(db, settings):
    repo = DevicePushRepository(db)
    await DevicePushRepository.ensure_indexes(db)
    record = DevicePushRecord(
        source_id="s1",
        tenant_id=TENANT,
        content_id="c",
        device_id="1",
        device_type="iris",
        status="QUEUED",
        queued_at=datetime.now(UTC),
    )
    await repo.insert(record)

    assert await repo.find_by_source_id("s1")
    assert await repo.find_by_source_id_and_tenant("s1", TENANT)
    with pytest.raises(NotFoundError):
        await repo.find_by_source_id_and_tenant("s1", OTHER_TENANT)
    updated = await repo.update_status("s1", "DELIVERED", datetime(2026, 11, 12, tzinfo=UTC))
    assert updated.status == "DELIVERED"
    again = await repo.update_status("s1", "DELIVERED", datetime(2026, 11, 12, tzinfo=UTC))
    assert again.synced_at == updated.synced_at
    with pytest.raises(DuplicateKeyError):
        await repo.insert(record)


async def test_iris_push_sends_sas_url_and_stores_record(client, db, vembi_calls, blob):
    content_id = await _content(db)

    response = await _push(client, content_id)

    assert response.status_code == 200
    assert response.json() == {"source_id": "src-1", "status": "QUEUED"}
    blob.get_sas_url_from_blob_url.assert_awaited_once_with(WAV, expiry_hours=1)
    sent = json.loads(vembi_calls[0].content)
    assert sent["file_url"] == SAS
    assert sent["language"] == "kn"
    assert sent["title"] == "Mina Quest"
    assert sent["folder"] == "story"
    record = await db["devicePushes"].find_one({"source_id": "src-1"})
    assert record["tenant_id"] == TENANT
    assert record["device_type"] == "iris"
    assert record["status"] == "QUEUED"


async def test_hexis_push_uses_text_file(client, db, blob):
    content_id = await _content(db)

    response = await _push(client, content_id, device_type="hexis")

    assert response.status_code == 200
    blob.get_sas_url_from_blob_url.assert_awaited_once_with(
        "https://acct.blob.core.windows.net/texts/a.txt", expiry_hours=1
    )


async def test_hexis_without_text_file_is_rejected(client, db, vembi_calls):
    content_id = await _content(db, text_file_url="")

    response = await _push(client, content_id, device_type="hexis")

    assert response.status_code == 422
    assert vembi_calls == []


@pytest.mark.parametrize(
    "audio",
    [[{"audio_url": WAV}], [{"audio_url": WAV, "duration_seconds": 0}]],
)
async def test_iris_without_playable_audio_is_rejected(client, db, vembi_calls, audio):
    content_id = await _content(db, audio_content=audio)

    response = await _push(client, content_id)

    assert response.status_code == 422
    assert vembi_calls == []


async def test_unprocessed_content_returns_409(client, db, vembi_calls):
    content_id = await _content(db, is_processed=False)

    response = await _push(client, content_id)

    assert response.status_code == 409
    assert response.json()["code"] == "CONTENT_NOT_PROCESSED"
    assert vembi_calls == []


async def test_other_tenant_content_returns_404(client, db, vembi_calls):
    content_id = await _content(db, tenant_id=ObjectId(OTHER_TENANT))

    response = await _push(client, content_id)

    assert response.status_code == 404
    assert vembi_calls == []


async def test_two_pushes_make_two_records(client, db, vembi_calls):
    content_id = await _content(db)

    await _push(client, content_id)
    await db["devicePushes"].delete_many({})
    await _push(client, content_id)

    assert len(vembi_calls) == 2


async def test_no_sas_token_in_logs(client, db, caplog):
    content_id = await _content(db)
    caplog.set_level("DEBUG")

    await _push(client, content_id)

    assert "secret-token" not in caplog.text


async def test_disallowed_role_is_refused(client, db, user):
    user["role"] = "content_creator"

    response = await _push(client, await _content(db))

    assert response.status_code == 403


async def test_status_polls_vembi_while_queued(client, db, vembi_calls):
    await _push(client, await _content(db))

    response = await client.get("/devices/push/src-1/status")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "DELIVERED"
    assert body["devices"][0]["device_id"] == "2000"
    assert body["devices"][0]["device_type"] == "iris"
    assert len(vembi_calls) == 2
    await client.get("/devices/push/src-1/status")
    assert len(vembi_calls) == 2


@pytest.mark.parametrize("final", ["DELIVERED", "FAILED"])
async def test_final_status_does_not_call_vembi(client, db, vembi_calls, final):
    await db["devicePushes"].insert_one(
        {
            "source_id": "done",
            "tenant_id": TENANT,
            "content_id": "c",
            "device_id": "1",
            "device_type": "hexis",
            "status": final,
            "queued_at": datetime.now(UTC),
            "synced_at": datetime.now(UTC),
        }
    )

    response = await client.get("/devices/push/done/status")

    assert response.json()["status"] == final
    assert vembi_calls == []


async def test_status_of_other_tenant_or_unknown_is_404(client, db):
    await _queued(db, "x")
    await db["devicePushes"].update_one({"source_id": "x"}, {"$set": {"tenant_id": OTHER_TENANT}})

    assert (await client.get("/devices/push/x/status")).status_code == 404
    assert (await client.get("/devices/push/none/status")).status_code == 404


async def _queued(db, source_id="src-9"):
    await db["devicePushes"].insert_one(
        {
            "source_id": source_id,
            "tenant_id": TENANT,
            "content_id": "c",
            "device_id": "1",
            "device_type": "iris",
            "status": "QUEUED",
            "queued_at": datetime.now(UTC),
            "synced_at": datetime.now(UTC),
        }
    )


async def _callback(client, payload, signature=None):
    body = json.dumps(payload).encode()
    headers = {"X-Vembi-Signature": _sign(body) if signature is None else signature}
    return await client.post("/devices/push/callback", content=body, headers=headers)


@pytest.mark.parametrize("status", ["QUEUED", "DELIVERED", "FAILED"])
async def test_callback_updates_status_without_token(client, db, status):
    await _queued(db)

    response = await _callback(client, {"source_id": "src-9", "status": status})

    assert response.status_code == 200
    assert (await db["devicePushes"].find_one({"source_id": "src-9"}))["status"] == status


async def test_callback_with_bad_signature_changes_nothing(client, db):
    await _queued(db)

    response = await _callback(client, {"source_id": "src-9", "status": "DELIVERED"}, "sha256=deadbeef")
    assert response.status_code == 401
    body = json.dumps({"source_id": "src-9", "status": "DELIVERED"}).encode()
    assert (await client.post("/devices/push/callback", content=body)).status_code == 422

    assert (await db["devicePushes"].find_one({"source_id": "src-9"}))["status"] == "QUEUED"


async def test_callback_bad_status_and_unknown_source(client, db):
    await _queued(db)

    assert (await _callback(client, {"source_id": "src-9", "status": "SYNCED"})).status_code == 422
    assert (await _callback(client, {"source_id": "nope", "status": "DELIVERED"})).status_code == 404
    assert (await db["devicePushes"].find_one({"source_id": "src-9"}))["status"] == "QUEUED"


async def test_repeat_callback_is_safe(client, db):
    await _queued(db)
    payload = {"source_id": "src-9", "status": "DELIVERED", "synced_at": "2026-11-12T11:29:14+05:30"}

    first = await _callback(client, payload)
    second = await _callback(client, payload)

    assert first.status_code == second.status_code == 200
    assert await db["devicePushes"].count_documents({"source_id": "src-9"}) == 1
