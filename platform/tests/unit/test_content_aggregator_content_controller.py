from __future__ import annotations

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from app.controllers.content_aggregator_content_controller import router
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import register_error_handlers
from app.platform.security import limiter, setup_security
from app.platform.settings import get_settings
from app.services.content_aggregator._jwt import encode_access_token
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"
BODY = {"type": "story", "language": "en"}


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


@pytest.fixture
async def client(db):
    limiter.reset()
    settings = get_settings()
    app = FastAPI()
    setup_security(app, settings)
    register_error_handlers(app)
    app.include_router(router)
    app.dependency_overrides[get_db] = lambda: db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://t") as c:
        yield c


def _headers(client_id: str, key: str | None = None) -> dict[str, str]:
    token, _ = encode_access_token(
        client_id=client_id,
        tenant_ids=[TENANT],
        scopes=["content:read", "content:write"],
        client_name=client_id,
        secret_key=get_settings().secret_key,
        expires_in="15m",
    )
    headers = {"Authorization": f"Bearer {token}", "x-tenant-ids": TENANT}
    if key:
        headers["Idempotency-Key"] = key
    return headers


async def test_create_same_idempotency_key_returns_same_job_id(client):
    first = await client.post("/v1/content", json=BODY, headers=_headers("c-same", "k1"))
    second = await client.post("/v1/content", json=BODY, headers=_headers("c-same", "k1"))

    assert first.status_code == second.status_code == 200
    assert first.json()["jobs"][TENANT] == second.json()["jobs"][TENANT]


async def test_create_same_idempotency_key_enqueues_once(client, db):
    await client.post("/v1/content", json=BODY, headers=_headers("c-once", "k2"))
    await client.post("/v1/content", json=BODY, headers=_headers("c-once", "k2"))

    assert await db["content_jobs"].count_documents({"content_id": "k2"}) == 1


async def test_eleventh_ingest_in_minute_returns_429(client):
    headers = _headers("c-limited")
    for _ in range(10):
        assert (await client.post("/v1/content", json=BODY, headers=headers)).status_code == 200

    assert (await client.post("/v1/content", json=BODY, headers=headers)).status_code == 429


async def test_second_client_not_limited_by_first(client):
    for _ in range(10):
        await client.post("/v1/content", json=BODY, headers=_headers("c-first"))

    response = await client.post("/v1/content", json=BODY, headers=_headers("c-second"))
    assert response.status_code == 200


async def test_unsupported_type_returns_400(client):
    response = await client.post(
        "/v1/content", json={"type": "video", "language": "en"}, headers=_headers("c-bad")
    )
    assert response.status_code == 400
    assert response.json()["code"] == "UNSUPPORTED_CONTENT_TYPE"


async def test_status_endpoint_reflects_job_state(client, db):
    created = await client.post("/v1/content", json=BODY, headers=_headers("c-status", "k3"))
    job_id = created.json()["jobs"][TENANT]
    headers = _headers("c-status")

    pending = await client.get("/v1/content-status/k3", headers=headers)
    assert pending.json()["status"] == "pending"

    await db["content_jobs"].update_one(
        {"_id": job_id}, {"$set": {"status": "failed", "reason": "boom"}}
    )
    failed = await client.get("/v1/content-status/k3", headers=headers)
    assert failed.json()["status"] == "failed"
    assert failed.json()["error"] == "boom"


async def test_status_endpoint_unknown_returns_404(client):
    response = await client.get("/v1/content-status/nope", headers=_headers("c-404"))
    assert response.status_code == 404


async def test_update_while_pending_returns_409(client):
    await client.post("/v1/content", json=BODY, headers=_headers("c-409", "k5"))
    response = await client.patch("/v1/content/k5", json={"description": "x"}, headers=_headers("c-409"))
    assert response.status_code == 409
    assert response.json()["code"] == "CONTENT_PROCESSING"


async def test_update_after_completion_reports_updated_fields(client, db):
    created = await client.post("/v1/content", json=BODY, headers=_headers("c-done", "k6"))
    await db["content_jobs"].update_one(
        {"_id": created.json()["jobs"][TENANT]}, {"$set": {"status": "completed"}}
    )
    response = await client.patch("/v1/content/k6", json={"description": "x"}, headers=_headers("c-done"))
    assert response.status_code == 200
    assert response.json()["updated_fields"] == ["description"]
