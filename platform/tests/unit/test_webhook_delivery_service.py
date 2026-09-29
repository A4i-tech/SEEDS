"""Unit tests for outbound content-aggregator webhook delivery (ticket #464).

Covers: HMAC-SHA256 signature verification, payload envelope shape, secret
encrypt/decrypt round trip, single-attempt delivery semantics (retry
scheduling / max-attempts disable / disabled-deleted webhook short-circuit
live at the consumer layer — see test_webhook_delivery_consumer.py), and
dispatch_terminal_event's durable pending-record fan-out + tenant isolation.

Spec: NFR-11 / §5.6 define 1 initial attempt + up to 5 retries (6 total),
with delay schedule 30s -> 5min -> 30min -> 2h -> 24h between attempts.
After the 6th (final) attempt fails, the webhook is disabled.
"""

from __future__ import annotations

import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Any
from unittest.mock import patch

import httpx
import pytest

from app.platform.auth.webhook_secret import decrypt_secret, encrypt_secret
from app.repositories.content_aggregator_webhook_delivery_repository import (
    ContentAggregatorWebhookDeliveryRepository,
)
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from app.services.webhook_delivery_service import (
    WEBHOOK_MAX_ATTEMPTS,
    attempt_delivery,
    build_payload,
    dispatch_terminal_event,
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


async def _make_webhook(webhook_repo, client_id=_TENANT_A, url="https://partner.example.com/hook", secret="topsecret", events=None):
    return await webhook_repo.create(client_id, url, encrypt_secret(secret), events or ["job.completed", "job.failed"])


async def _make_attempt(delivery_repo, wh, *, attempt_number=1, content_id="content-1", event="job.completed", data=None):
    now = datetime.now(UTC).isoformat()
    return await delivery_repo.create_pending(
        webhook_id=wh["_id"],
        content_id=content_id,
        event=event,
        tenant_id=_TENANT_A,
        client_id=wh["client_id"],
        payload_data=data or {"jobId": "j1"},
        attempt_number=attempt_number,
        next_attempt_at=now,
    )


class _FakeAsyncClient:
    """Stand-in for httpx.AsyncClient — used as `async with httpx.AsyncClient(...) as client`."""

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


# ---------------------------------------------------------------------------
# Signature / payload / secret
# ---------------------------------------------------------------------------


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
    payload = build_payload("job.completed", "wh1", "tenant-a", {"jobId": "j1"})
    raw_body = serialize_payload(payload)
    assert raw_body == json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")


def test_build_payload_completed_envelope_fields():
    payload = build_payload("job.completed", "wh-id", "tenant-a", {"jobId": "j1", "contentId": "c1", "jobName": "processNewContent", "completedAt": "2026-01-01T00:00:00+00:00"})
    assert payload["event"] == "job.completed"
    assert payload["webhookId"] == "wh-id"
    assert payload["tenantId"] == "tenant-a"
    assert "timestamp" in payload
    assert payload["data"]["completedAt"]
    assert set(payload.keys()) == {"event", "webhookId", "tenantId", "timestamp", "data"}


def test_build_payload_failed_envelope_fields():
    payload = build_payload("job.failed", "wh-id", "tenant-a", {"jobId": "j1", "contentId": "c1", "jobName": "processNewContent", "failedAt": "2026-01-01T00:00:00+00:00", "error": "boom"})
    assert payload["event"] == "job.failed"
    assert payload["data"]["error"] == "boom"
    assert payload["data"]["failedAt"]


def test_encrypt_decrypt_secret_round_trip():
    secret = "my-webhook-secret-value"
    token = encrypt_secret(secret)
    assert token != secret
    assert decrypt_secret(token) == secret


# ---------------------------------------------------------------------------
# attempt_delivery — single-attempt semantics (retry/disable live in the
# consumer-level tests, since the durable schedule spans multiple claims)
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_attempt_delivery_success_records_result(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([httpx.Response(200)])
    with patcher:
        await attempt_delivery(attempt, webhook_repo, delivery_repo)
    assert len(fake.calls) == 1
    doc = await delivery_repo._col.find_one({"_id": attempt["_id"]})
    assert doc["succeeded"] is True
    assert doc["responseCode"] == 200
    assert doc["status"] == "succeeded"
    current = await webhook_repo.get_for_client(_TENANT_A, str(wh["_id"]))
    assert current["status"] == "active"


@pytest.mark.asyncio
async def test_attempt_delivery_signature_header_matches_recomputed_hmac(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo, secret="check-me")
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([httpx.Response(200)])
    with patcher:
        await attempt_delivery(attempt, webhook_repo, delivery_repo)
    call = fake.calls[0]
    raw_body = call["content"]
    signature = call["headers"]["X-SEEDS-Signature"]
    expected = "sha256=" + hmac.new(b"check-me", raw_body, hashlib.sha256).hexdigest()
    assert signature == expected


@pytest.mark.asyncio
async def test_attempt_delivery_failure_schedules_next_attempt(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh, attempt_number=1)
    patcher, fake = _patch_client([httpx.Response(500)])
    with patcher:
        await attempt_delivery(attempt, webhook_repo, delivery_repo)
    doc = await delivery_repo._col.find_one({"_id": attempt["_id"]})
    assert doc["succeeded"] is False
    assert doc["status"] == "failed"
    pending = await delivery_repo._col.find_one({"webhookId": str(wh["_id"]), "status": "pending"})
    assert pending is not None
    assert pending["attemptNumber"] == 2
    assert pending["nextAttemptAt"] > datetime.now(UTC).isoformat()
    current = await webhook_repo.get_for_client(_TENANT_A, str(wh["_id"]))
    assert current["status"] == "active"


@pytest.mark.asyncio
async def test_attempt_delivery_final_failure_disables_webhook_no_further_pending(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh, attempt_number=WEBHOOK_MAX_ATTEMPTS)
    patcher, fake = _patch_client([httpx.Response(500)])
    with patcher:
        await attempt_delivery(attempt, webhook_repo, delivery_repo)
    current = await webhook_repo.get_for_client(_TENANT_A, str(wh["_id"]))
    assert current["status"] == "disabled"
    pending = await delivery_repo._col.find_one({"webhookId": str(wh["_id"]), "status": "pending"})
    assert pending is None


@pytest.mark.asyncio
async def test_attempt_delivery_skips_when_already_disabled(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    await webhook_repo.disable(wh["_id"])
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([])
    with patcher:
        await attempt_delivery(attempt, webhook_repo, delivery_repo)
    assert fake.calls == []
    doc = await delivery_repo._col.find_one({"_id": attempt["_id"]})
    assert doc["status"] == "skipped"
    pending = await delivery_repo._col.find_one({"webhookId": str(wh["_id"]), "status": "pending"})
    assert pending is None


@pytest.mark.asyncio
async def test_attempt_delivery_skips_when_webhook_deleted(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh)
    await webhook_repo._col.delete_one({"_id": wh["_id"]})
    patcher, fake = _patch_client([])
    with patcher:
        await attempt_delivery(attempt, webhook_repo, delivery_repo)
    assert fake.calls == []
    doc = await delivery_repo._col.find_one({"_id": attempt["_id"]})
    assert doc["status"] == "skipped"


@pytest.mark.parametrize("outcome_factory,error_substr", [
    (lambda: httpx.Response(404), "non-2xx response: 404"),
    (lambda: httpx.Response(500), "non-2xx response: 500"),
    (lambda: httpx.TimeoutException("boom"), "timeout"),
    (lambda: httpx.ConnectError("boom"), "http error"),
])
@pytest.mark.asyncio
async def test_attempt_delivery_records_error_type(webhook_repo, delivery_repo, outcome_factory, error_substr):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([outcome_factory()])
    with patcher:
        await attempt_delivery(attempt, webhook_repo, delivery_repo)
    doc = await delivery_repo._col.find_one({"_id": attempt["_id"]})
    assert error_substr in doc["error"]
    assert doc["succeeded"] is False


@pytest.mark.asyncio
async def test_attempt_delivery_secret_unreadable_does_not_crash(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([])
    with patcher, patch("app.services.webhook_delivery_service.decrypt_secret", side_effect=ValueError("bad key")):
        await attempt_delivery(attempt, webhook_repo, delivery_repo)
    assert fake.calls == []
    doc = await delivery_repo._col.find_one({"_id": attempt["_id"]})
    assert doc["succeeded"] is False
    assert doc["error"] == "secret unreadable"


@pytest.mark.asyncio
async def test_attempt_delivery_no_credentials_leaked(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo, secret="never-log-me")
    attempt = await _make_attempt(delivery_repo, wh)
    patcher, fake = _patch_client([httpx.Response(200)])
    with patcher:
        await attempt_delivery(attempt, webhook_repo, delivery_repo)
    doc = await delivery_repo._col.find_one({"_id": attempt["_id"]})
    for field in ("webhookId", "contentId", "event", "attemptedAt", "attemptNumber", "responseCode", "succeeded", "error"):
        assert field in doc
    serialized = json.dumps(doc, default=str)
    assert "never-log-me" not in serialized
    assert "sha256=" not in serialized


# ---------------------------------------------------------------------------
# dispatch_terminal_event — durable fan-out, tenant isolation
# ---------------------------------------------------------------------------


async def _seed_content(db, content_id, tenant_id):
    from bson import ObjectId

    await db["contentsV3"].insert_one({"_id": ObjectId(content_id), "tenant_id": tenant_id})


async def _seed_client(db, client_id, tenant_id):
    await db["integrationClients"].insert_one({"client_id": client_id, "tenant_ids": [tenant_id]})


async def _pending_docs(db):
    return await db["contentAggregatorWebhookDeliveries"].find({"status": "pending"}).to_list(length=None)


@pytest.mark.asyncio
async def test_dispatch_terminal_event_fanout_creates_one_pending_record_per_webhook(db, webhook_repo, delivery_repo):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _seed_client(db, _TENANT_A, _TENANT_A)
    good = await _make_webhook(webhook_repo, url="https://good.example.com/hook")
    bad = await _make_webhook(webhook_repo, url="https://bad.example.com/hook")

    await dispatch_terminal_event(db, content_id, "job.completed", job_id="job-1")

    pending = await _pending_docs(db)
    assert {p["webhookId"] for p in pending} == {str(good["_id"]), str(bad["_id"])}
    assert all(p["attemptNumber"] == 1 for p in pending)


@pytest.mark.asyncio
async def test_dispatch_terminal_event_tenant_isolation(db, webhook_repo, delivery_repo):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _seed_client(db, _TENANT_A, _TENANT_A)
    await _seed_client(db, _TENANT_B, _TENANT_B)
    wh_a = await _make_webhook(webhook_repo, client_id=_TENANT_A, url="https://a.example.com/hook")
    wh_b = await _make_webhook(webhook_repo, client_id=_TENANT_B, url="https://b.example.com/hook")

    await dispatch_terminal_event(db, content_id, "job.completed", job_id="job-1")

    pending = await _pending_docs(db)
    assert {p["webhookId"] for p in pending} == {str(wh_a["_id"])}
    assert str(wh_b["_id"]) not in {p["webhookId"] for p in pending}


@pytest.mark.asyncio
async def test_dispatch_terminal_event_no_webhooks_for_event_type_is_noop(db, webhook_repo):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _seed_client(db, _TENANT_A, _TENANT_A)
    await _make_webhook(webhook_repo, events=["content.updated"])

    await dispatch_terminal_event(db, content_id, "job.completed", job_id="job-1")

    assert await _pending_docs(db) == []


@pytest.mark.asyncio
async def test_dispatch_terminal_event_resolves_client_id_distinct_from_tenant_id(db, webhook_repo, delivery_repo):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _seed_client(db, "client-xyz", _TENANT_A)
    wh = await _make_webhook(webhook_repo, client_id="client-xyz")

    await dispatch_terminal_event(db, content_id, "job.completed", job_id="job-1")

    pending = await _pending_docs(db)
    assert [p["webhookId"] for p in pending] == [str(wh["_id"])]


@pytest.mark.asyncio
async def test_dispatch_terminal_event_missing_content_never_raises(db):
    await dispatch_terminal_event(db, str((await db["contentsV3"].insert_one({"tenant_id": _TENANT_A})).inserted_id), "job.completed", job_id="job-1")


@pytest.mark.asyncio
async def test_dispatch_terminal_event_payload_data_fields(db, webhook_repo, delivery_repo):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _seed_client(db, _TENANT_A, _TENANT_A)
    await _make_webhook(webhook_repo)

    await dispatch_terminal_event(db, content_id, "job.failed", job_id="job-9", error="ffmpeg exploded")

    pending = await _pending_docs(db)
    assert len(pending) == 1
    data = pending[0]["payloadData"]
    assert data["jobId"] == "job-9"
    assert data["contentId"] == content_id
    assert data["error"] == "processing_failed"
    assert "failedAt" in data
