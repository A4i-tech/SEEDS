from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Any
from unittest.mock import patch

import httpx
import pytest
from cryptography.fernet import InvalidToken
from pydantic import ValidationError

from app.models.requests.webhook_registration_requests import WebhookEventType
from app.platform.auth.webhook_secret import decrypt_secret, encrypt_secret
from app.platform.error_handling import ConfigurationError
from app.repositories.content_aggregator_webhook_delivery_repository import (
    ContentAggregatorWebhookDeliveryRepository,
)
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from app.repositories.content_repository import ContentRepository
from app.repositories.integration_client_repository import IntegrationClientRepository
from app.services.webhook_delivery_service import (
    WEBHOOK_MAX_ATTEMPTS,
    WebhookDeliveryService,
    build_payload,
    serialize_payload,
    sign_payload,
)
from tests.support.mongomock_async import AsyncMongoMockClient

_TENANT_A = "tenant-a"
_TENANT_B = "tenant-b"


@pytest.fixture
def db():
    return AsyncMongoMockClient()["seeds"]


@pytest.fixture
def webhook_repo(db):
    return ContentAggregatorWebhookRepository(db)


@pytest.fixture
def delivery_repo(db):
    return ContentAggregatorWebhookDeliveryRepository(db)


@pytest.fixture
def content_repo(db):
    return ContentRepository(db)


@pytest.fixture
def client_repo(db):
    return IntegrationClientRepository(db)


@pytest.fixture
def service(webhook_repo, delivery_repo, content_repo, client_repo):
    return WebhookDeliveryService(webhook_repo, delivery_repo, content_repo, client_repo)


async def _make_webhook(webhook_repo, client_id=_TENANT_A, url="https://partner.example.com/hook", secret="topsecret", events=None):
    events = events or [WebhookEventType.JOB_COMPLETED, WebhookEventType.JOB_FAILED]
    return await webhook_repo.create(client_id, url, encrypt_secret(secret), events)


async def _make_attempt(delivery_repo, wh, *, attempt_number=1, content_id="content-1", event=WebhookEventType.JOB_COMPLETED, data=None):
    return await delivery_repo.create_pending(
        webhook_id=wh.id,
        content_id=content_id,
        event=event,
        tenant_id=_TENANT_A,
        client_id=wh.client_id,
        payload_data=data or {"jobId": "j1"},
        attempt_number=attempt_number,
        next_attempt_at=datetime.now(UTC),
    )


class _FakeAsyncClient:
    def __init__(self, outcomes: list[Any]) -> None:
        self._outcomes = list(outcomes)
        self.calls: list[dict[str, Any]] = []

    async def __aenter__(self) -> _FakeAsyncClient:
        return self

    async def __aexit__(self, *exc: Any) -> bool:
        return False

    async def post(self, url: str, **kwargs: Any) -> httpx.Response:
        self.calls.append({"url": url, **kwargs})
        outcome = self._outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


def _patch_client(outcomes: list[Any]):
    fake = _FakeAsyncClient(outcomes)
    return patch("app.services.webhook_delivery_service.httpx.AsyncClient", lambda **kw: fake), fake


def test_sign_payload_is_independently_verifiable():
    secret = "s3cret"
    raw_body = b'{"a":1}'
    signature = sign_payload(secret, raw_body)
    assert signature.startswith("sha256=")
    expected_digest = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    assert signature == f"sha256={expected_digest}"


def test_sign_payload_wrong_secret_fails_verification():
    raw_body = b'{"a":1}'
    signature = sign_payload("right-secret", raw_body)
    other_digest = hmac.new(b"wrong-secret", raw_body, hashlib.sha256).hexdigest()
    assert signature != f"sha256={other_digest}"


def test_serialize_payload_matches_signed_bytes():
    payload = build_payload(WebhookEventType.JOB_COMPLETED, "wh1", "tenant-a", {"jobId": "j1"})
    raw_body = serialize_payload(payload)
    assert raw_body == json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def test_build_payload_completed_envelope_fields():
    payload = build_payload(WebhookEventType.JOB_COMPLETED, "wh-id", "tenant-a", {"jobId": "j1", "contentId": "c1", "jobName": "processNewContent", "completedAt": "2026-01-01T00:00:00+00:00"})
    assert payload["event"] == "job.completed"
    assert payload["webhookId"] == "wh-id"
    assert payload["tenantId"] == "tenant-a"
    assert "timestamp" in payload
    assert payload["data"]["completedAt"]
    assert set(payload.keys()) == {"event", "webhookId", "tenantId", "timestamp", "data"}


def test_build_payload_failed_envelope_fields():
    payload = build_payload(WebhookEventType.JOB_FAILED, "wh-id", "tenant-a", {"jobId": "j1", "contentId": "c1", "jobName": "processNewContent", "failedAt": "2026-01-01T00:00:00+00:00", "error": "boom"})
    assert payload["event"] == "job.failed"
    assert payload["data"]["error"] == "boom"
    assert payload["data"]["failedAt"]


def test_encrypt_decrypt_secret_round_trip():
    secret = "my-webhook-secret-value"
    token = encrypt_secret(secret)
    assert token != secret
    assert decrypt_secret(token) == secret


@pytest.mark.asyncio
async def test_attempt_delivery_success_records_result(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([httpx.Response(200)])
    with patcher:
        await service.attempt_delivery(attempt)
    assert len(fake.calls) == 1
    doc = await delivery_repo._col.find_one({"_id": delivery_repo._to_id(attempt.id)})
    assert doc["succeeded"] is True
    assert doc["response_code"] == 200
    assert doc["status"] == "succeeded"
    current = await webhook_repo.get_for_client(_TENANT_A, wh.id)
    assert current.status == "active"


@pytest.mark.asyncio
async def test_attempt_delivery_signature_header_matches_recomputed_hmac(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo, secret="check-me")
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([httpx.Response(200)])
    with patcher:
        await service.attempt_delivery(attempt)
    call = fake.calls[0]
    raw_body = call["content"]
    signature = call["headers"]["X-SEEDS-Signature"]
    expected = "sha256=" + hmac.new(b"check-me", raw_body, hashlib.sha256).hexdigest()
    assert signature == expected


@pytest.mark.asyncio
async def test_attempt_delivery_failure_schedules_next_attempt(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh, attempt_number=1)
    patcher, fake = _patch_client([httpx.Response(500)])
    with patcher:
        await service.attempt_delivery(attempt)
    doc = await delivery_repo._col.find_one({"_id": delivery_repo._to_id(attempt.id)})
    assert doc["succeeded"] is False
    assert doc["status"] == "failed"
    pending = await delivery_repo._col.find_one({"webhook_id": delivery_repo._to_id(wh.id), "status": "pending"})
    assert pending is not None
    assert pending["attempt_number"] == 2
    assert pending["next_attempt_at"] > datetime.now(UTC).replace(tzinfo=None)
    current = await webhook_repo.get_for_client(_TENANT_A, wh.id)
    assert current.status == "active"


@pytest.mark.asyncio
async def test_attempt_delivery_final_failure_disables_webhook_no_further_pending(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh, attempt_number=WEBHOOK_MAX_ATTEMPTS)
    patcher, fake = _patch_client([httpx.Response(500)])
    with patcher:
        await service.attempt_delivery(attempt)
    current = await webhook_repo.get_for_client(_TENANT_A, wh.id)
    assert current.status == "disabled"
    pending = await delivery_repo._col.find_one({"webhook_id": delivery_repo._to_id(wh.id), "status": "pending"})
    assert pending is None


@pytest.mark.asyncio
async def test_attempt_delivery_skips_when_already_disabled(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo)
    await webhook_repo.disable(wh.id)
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([])
    with patcher:
        await service.attempt_delivery(attempt)
    assert fake.calls == []
    doc = await delivery_repo._col.find_one({"_id": delivery_repo._to_id(attempt.id)})
    assert doc["status"] == "skipped"
    pending = await delivery_repo._col.find_one({"webhook_id": delivery_repo._to_id(wh.id), "status": "pending"})
    assert pending is None


@pytest.mark.asyncio
async def test_attempt_delivery_skips_when_webhook_deleted(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh)
    await webhook_repo._col.delete_one({"_id": webhook_repo._to_id(wh.id)})
    patcher, fake = _patch_client([])
    with patcher:
        await service.attempt_delivery(attempt)
    assert fake.calls == []
    doc = await delivery_repo._col.find_one({"_id": delivery_repo._to_id(attempt.id)})
    assert doc["status"] == "skipped"


@pytest.mark.parametrize("outcome_factory,error_substr", [
    (lambda: httpx.Response(404), "non-2xx response: 404"),
    (lambda: httpx.Response(500), "non-2xx response: 500"),
    (lambda: httpx.TimeoutException("boom"), "TimeoutException"),
    (lambda: httpx.ConnectError("boom"), "ConnectError"),
])
@pytest.mark.asyncio
async def test_attempt_delivery_records_error_type(webhook_repo, delivery_repo, service, outcome_factory, error_substr):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([outcome_factory()])
    with patcher:
        await service.attempt_delivery(attempt)
    doc = await delivery_repo._col.find_one({"_id": delivery_repo._to_id(attempt.id)})
    assert error_substr in doc["error"]
    assert doc["succeeded"] is False


@pytest.mark.asyncio
async def test_attempt_delivery_secret_unreadable_does_not_crash(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([])
    with patcher, patch("app.services.webhook_delivery_service.decrypt_secret", side_effect=ConfigurationError("bad key")):
        await service.attempt_delivery(attempt)
    assert fake.calls == []
    doc = await delivery_repo._col.find_one({"_id": delivery_repo._to_id(attempt.id)})
    assert doc["status"] == "pending"
    assert doc["claimed_at"] is None
    assert "configuration" in doc["error"]


@pytest.mark.asyncio
async def test_attempt_delivery_invalid_token_recorded_as_secret_unreadable(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([])
    with patcher, patch(
        "app.services.webhook_delivery_service.decrypt_secret",
        side_effect=InvalidToken("bad token"),
    ):
        await service.attempt_delivery(attempt)
    assert fake.calls == []
    doc = await delivery_repo._col.find_one({"_id": delivery_repo._to_id(attempt.id)})
    assert doc["status"] == "pending"
    assert doc["claimed_at"] is None
    assert "InvalidToken" in doc["error"]


@pytest.mark.asyncio
async def test_attempt_delivery_unrelated_exception_propagates(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh, attempt_number=1)
    patcher, fake = _patch_client([])
    with patcher, patch(
        "app.services.webhook_delivery_service.decrypt_secret",
        side_effect=RuntimeError("boom"),
    ), pytest.raises(RuntimeError, match="boom"):
        await service.attempt_delivery(attempt)
    assert fake.calls == []


@pytest.mark.asyncio
async def test_attempt_delivery_missing_secret_field_raises(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo)
    await webhook_repo._col.update_one({"_id": webhook_repo._to_id(wh.id)}, {"$unset": {"secret_encrypted": ""}})
    attempt = await _make_attempt(delivery_repo, wh, attempt_number=1)
    patcher, fake = _patch_client([])
    with patcher, pytest.raises(ValidationError):
        await service.attempt_delivery(attempt)
    assert fake.calls == []


@pytest.mark.asyncio
async def test_attempt_delivery_no_credentials_leaked(webhook_repo, delivery_repo, service):
    wh = await _make_webhook(webhook_repo, secret="never-log-me")
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([httpx.Response(200)])
    with patcher:
        await service.attempt_delivery(attempt)
    doc = await delivery_repo._col.find_one({"_id": delivery_repo._to_id(attempt.id)})
    for field in ("webhook_id", "content_id", "event", "attempted_at", "attempt_number", "response_code", "succeeded", "error"):
        assert field in doc
    serialized = json.dumps(doc, default=str)
    assert "never-log-me" not in serialized
    assert "sha256=" not in serialized


async def _seed_content(db, content_id, tenant_id):
    from bson import ObjectId

    await db["contentsV3"].insert_one({"_id": ObjectId(content_id), "tenant_id": tenant_id})


async def _seed_client(db, client_id, tenant_id):
    await db["integrationClients"].insert_one({"client_id": client_id, "tenant_ids": [tenant_id], "status": "active"})


async def _pending_docs(db):
    return await db["contentAggregatorWebhookDeliveries"].find({"status": "pending"}).to_list(length=None)


@pytest.mark.asyncio
async def test_dispatch_terminal_event_fanout_creates_one_pending_record_per_webhook(db, webhook_repo, delivery_repo, service):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _seed_client(db, _TENANT_A, _TENANT_A)
    good = await _make_webhook(webhook_repo, url="https://good.example.com/hook")
    bad = await _make_webhook(webhook_repo, url="https://bad.example.com/hook")

    await service.dispatch_terminal_event({"_id": "job-1", "content_id": content_id}, WebhookEventType.JOB_COMPLETED)

    pending = await _pending_docs(db)
    assert {str(p["webhook_id"]) for p in pending} == {good.id, bad.id}
    assert all(p["attempt_number"] == 1 for p in pending)


@pytest.mark.asyncio
async def test_dispatch_terminal_event_tenant_isolation(db, webhook_repo, delivery_repo, service):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _seed_client(db, _TENANT_A, _TENANT_A)
    await _seed_client(db, _TENANT_B, _TENANT_B)
    wh_a = await _make_webhook(webhook_repo, client_id=_TENANT_A, url="https://a.example.com/hook")
    wh_b = await _make_webhook(webhook_repo, client_id=_TENANT_B, url="https://b.example.com/hook")

    await service.dispatch_terminal_event({"_id": "job-1", "content_id": content_id}, WebhookEventType.JOB_COMPLETED)

    pending = await _pending_docs(db)
    assert {str(p["webhook_id"]) for p in pending} == {wh_a.id}
    assert wh_b.id not in {str(p["webhook_id"]) for p in pending}


@pytest.mark.asyncio
async def test_dispatch_terminal_event_no_webhooks_for_event_type_is_noop(db, webhook_repo, service):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _seed_client(db, _TENANT_A, _TENANT_A)
    await _make_webhook(webhook_repo, events=[WebhookEventType.CONTENT_UPDATED])

    await service.dispatch_terminal_event({"_id": "job-1", "content_id": content_id}, WebhookEventType.JOB_COMPLETED)

    assert await _pending_docs(db) == []


@pytest.mark.asyncio
async def test_dispatch_terminal_event_resolves_client_id_distinct_from_tenant_id(db, webhook_repo, delivery_repo, service):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _seed_client(db, "client-xyz", _TENANT_A)
    wh = await _make_webhook(webhook_repo, client_id="client-xyz")

    await service.dispatch_terminal_event({"_id": "job-1", "content_id": content_id}, WebhookEventType.JOB_COMPLETED)

    pending = await _pending_docs(db)
    assert [str(p["webhook_id"]) for p in pending] == [wh.id]


@pytest.mark.asyncio
async def test_dispatch_terminal_event_missing_content_never_raises(db, service):
    content_id = str((await db["contentsV3"].insert_one({"tenant_id": _TENANT_A})).inserted_id)
    await service.dispatch_terminal_event({"_id": "job-1", "content_id": content_id}, WebhookEventType.JOB_COMPLETED)


@pytest.mark.asyncio
async def test_dispatch_terminal_event_payload_data_fields(db, webhook_repo, delivery_repo, service):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _seed_client(db, _TENANT_A, _TENANT_A)
    await _make_webhook(webhook_repo)

    await service.dispatch_terminal_event(
        {"_id": "job-9", "content_id": content_id, "reason": "ffmpeg exploded"},
        WebhookEventType.JOB_FAILED,
    )

    pending = await _pending_docs(db)
    assert len(pending) == 1
    data = pending[0]["payload_data"]
    assert data["jobId"] == "job-9"
    assert data["contentId"] == content_id
    assert data["error"] == "ffmpeg exploded"
    assert "failedAt" in data
