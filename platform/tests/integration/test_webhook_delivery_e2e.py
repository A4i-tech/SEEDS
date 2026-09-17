from __future__ import annotations

import hashlib
import hmac
import json

import pytest
from bson import ObjectId
from httpx import ASGITransport, AsyncClient

import app.controllers.webhook_registration_controller as webhook_registration_controller
import app.services.webhook_delivery_service as webhook_delivery_service
from app.main import app
from app.platform.auth.dependencies import get_db
from tests.support.mongomock_async import AsyncMongoMockClient
from tests.support.webhook_test_receiver import WebhookTestReceiver


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


@pytest.fixture(autouse=True)
def _override_db(mock_db):
    app.dependency_overrides[get_db] = lambda: mock_db
    yield
    app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def _allow_local_http_url(monkeypatch):
    monkeypatch.setattr(webhook_registration_controller, "_validate_url", lambda url: None)


@pytest.fixture(autouse=True)
def _no_retry_delay(monkeypatch):
    monkeypatch.setattr(webhook_delivery_service, "WEBHOOK_RETRY_DELAYS_SECONDS", (0, 0, 0, 0, 0))


@pytest.fixture
def receiver():
    r = WebhookTestReceiver()
    r.start()
    yield r
    r.stop()


@pytest.fixture
async def client():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


async def _register_client_and_webhook(client, receiver, *, events=("job.completed", "job.failed")):
    tenant_id = str(ObjectId())
    reg = await client.post(
        "/v1/auth/register",
        json={"name": "Partner", "tenant_ids": [tenant_id], "scopes": ["content:write", "content:read"]},
    )
    assert reg.status_code == 200, reg.text
    creds = reg.json()
    tok = await client.post(
        "/v1/auth/token",
        json={
            "client_id": creds["client_id"],
            "client_secret": creds["client_secret"],
            "scope": "content:write content:read",
        },
    )
    assert tok.status_code == 200, tok.text
    token = tok.json()["access_token"]
    wh = await client.post(
        "/v1/webhooks",
        json={"url": receiver.url, "events": list(events)},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert wh.status_code == 201, wh.text
    return tenant_id, wh.json(), token


async def _seed_content(mock_db, tenant_id: str) -> str:
    content_id = ObjectId()
    await mock_db["contentsV3"].insert_one({"_id": content_id, "tenant_id": ObjectId(tenant_id)})
    return str(content_id)


async def test_completed_job_delivers_webhook_with_valid_signature(client, receiver, mock_db):
    tenant_id, webhook, _ = await _register_client_and_webhook(client, receiver)
    content_id = await _seed_content(mock_db, tenant_id)

    await webhook_delivery_service.dispatch_terminal_event(
        mock_db, content_id, "job.completed", job_id="job-1"
    )

    assert receiver.request_count == 1
    req = receiver.requests[0]
    assert req.headers["Content-Type"] == "application/json"
    signature = req.headers["X-SEEDS-Signature"]
    expected = "sha256=" + hmac.new(webhook["secret"].encode(), req.body, hashlib.sha256).hexdigest()
    assert signature == expected

    payload = json.loads(req.body)
    assert payload["event"] == "job.completed"
    assert payload["webhookId"] == webhook["webhookId"]
    assert payload["tenantId"] == tenant_id
    assert payload["data"]["jobId"] == "job-1"
    assert payload["data"]["contentId"] == content_id
    assert "completedAt" in payload["data"]

    deliveries = await mock_db["contentAggregatorWebhookDeliveries"].find({}).to_list(length=None)
    assert len(deliveries) == 1
    assert deliveries[0]["succeeded"] is True
    assert deliveries[0]["responseCode"] == 200
    assert deliveries[0]["attemptNumber"] == 1


async def test_failed_job_delivers_webhook_with_error(client, receiver, mock_db):
    tenant_id, webhook, _ = await _register_client_and_webhook(client, receiver)
    content_id = await _seed_content(mock_db, tenant_id)

    await webhook_delivery_service.dispatch_terminal_event(
        mock_db, content_id, "job.failed", job_id="job-2", error="boom"
    )

    payload = json.loads(receiver.requests[0].body)
    assert payload["event"] == "job.failed"
    assert payload["data"]["error"] == "boom"
    assert "failedAt" in payload["data"]


async def test_retry_then_success_records_all_attempts(client, receiver, mock_db):
    tenant_id, webhook, _ = await _register_client_and_webhook(client, receiver)
    content_id = await _seed_content(mock_db, tenant_id)

    receiver.queue_response_code(500)
    receiver.queue_response_code(500)

    await webhook_delivery_service.dispatch_terminal_event(
        mock_db, content_id, "job.completed", job_id="job-3"
    )

    assert receiver.request_count == 3
    deliveries = await mock_db["contentAggregatorWebhookDeliveries"].find({}).sort("attemptNumber", 1).to_list(
        length=None
    )
    assert [d["attemptNumber"] for d in deliveries] == [1, 2, 3]
    assert [d["succeeded"] for d in deliveries] == [False, False, True]
    assert deliveries[0]["responseCode"] == 500

    doc = await mock_db["contentAggregatorWebhooks"].find_one({"_id": ObjectId(webhook["webhookId"])})
    assert doc["status"] == "active"


async def test_exhausted_retries_dead_letters_and_disables_webhook(client, receiver, mock_db):
    tenant_id, webhook, _ = await _register_client_and_webhook(client, receiver)
    content_id = await _seed_content(mock_db, tenant_id)

    for _ in range(6):
        receiver.queue_response_code(500)

    await webhook_delivery_service.dispatch_terminal_event(
        mock_db, content_id, "job.completed", job_id="job-4"
    )

    assert receiver.request_count == webhook_delivery_service.WEBHOOK_MAX_ATTEMPTS
    deliveries = await mock_db["contentAggregatorWebhookDeliveries"].find({}).to_list(length=None)
    assert len(deliveries) == webhook_delivery_service.WEBHOOK_MAX_ATTEMPTS
    assert all(not d["succeeded"] for d in deliveries)

    doc = await mock_db["contentAggregatorWebhooks"].find_one({"_id": ObjectId(webhook["webhookId"])})
    assert doc["status"] == "disabled"


async def test_deleted_webhook_receives_no_delivery(client, receiver, mock_db):
    tenant_id, webhook, token = await _register_client_and_webhook(client, receiver)
    content_id = await _seed_content(mock_db, tenant_id)
    del_resp = await client.delete(
        f"/v1/webhooks/{webhook['webhookId']}", headers={"Authorization": f"Bearer {token}"}
    )
    assert del_resp.status_code == 204

    await webhook_delivery_service.dispatch_terminal_event(
        mock_db, content_id, "job.completed", job_id="job-5"
    )

    assert receiver.request_count == 0


async def test_multiple_webhooks_fan_out_and_one_failure_does_not_block_other(client, mock_db):
    good_receiver = WebhookTestReceiver()
    bad_receiver = WebhookTestReceiver()
    good_receiver.start()
    bad_receiver.start()
    try:
        tenant_id, good_webhook, token = await _register_client_and_webhook(client, good_receiver)
        bad_transport = ASGITransport(app=app)
        async with AsyncClient(transport=bad_transport, base_url="http://test") as c2:
            bad = await c2.post(
                "/v1/webhooks",
                json={"url": bad_receiver.url, "events": ["job.completed"]},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert bad.status_code == 201, bad.text

        for _ in range(webhook_delivery_service.WEBHOOK_MAX_ATTEMPTS):
            bad_receiver.queue_response_code(500)

        content_id = await _seed_content(mock_db, tenant_id)
        await webhook_delivery_service.dispatch_terminal_event(
            mock_db, content_id, "job.completed", job_id="job-6"
        )

        assert good_receiver.request_count == 1
        assert bad_receiver.request_count == webhook_delivery_service.WEBHOOK_MAX_ATTEMPTS

        good_doc = await mock_db["contentAggregatorWebhooks"].find_one(
            {"_id": ObjectId(good_webhook["webhookId"])}
        )
        bad_doc = await mock_db["contentAggregatorWebhooks"].find_one({"_id": ObjectId(bad.json()["webhookId"])})
        assert good_doc["status"] == "active"
        assert bad_doc["status"] == "disabled"
    finally:
        good_receiver.stop()
        bad_receiver.stop()
