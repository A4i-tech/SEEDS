"""Unit tests for outbound content-aggregator webhook delivery (ticket #464).

Covers: HMAC-SHA256 signature verification, payload envelope shape, secret
encrypt/decrypt round trip, retry/backoff schedule, max-attempts disable,
disabled/deleted webhook short-circuiting, multi-webhook fan-out isolation,
tenant isolation, and delivery-log credential hygiene.

Spec: NFR-11 / §5.6 define 1 initial attempt + up to 5 retries (6 total),
with delay schedule 30s -> 5min -> 30min -> 2h -> 24h between attempts.
After the 6th (final) attempt fails, the webhook is disabled.
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import json
from datetime import UTC, datetime
from typing import Any
from unittest.mock import AsyncMock, patch

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
    WEBHOOK_RETRY_DELAYS_SECONDS,
    build_payload,
    deliver_webhook,
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


def _patch_sleep():
    return patch("app.services.webhook_delivery_service.asyncio.sleep", new_callable=AsyncMock)


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
# deliver_webhook — single webhook delivery, retry, disable
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_deliver_webhook_success_first_attempt_no_sleep(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    payload = build_payload("job.completed", wh["_id"], _TENANT_A, {"jobId": "j1"})
    patcher, fake = _patch_client([httpx.Response(200)])
    with patcher, _patch_sleep() as sleep_mock:
        await deliver_webhook(wh, "job.completed", payload, "content-1", webhook_repo, delivery_repo)
    assert len(fake.calls) == 1
    sleep_mock.assert_not_called()
    attempts = await delivery_repo._col.find({"webhookId": str(wh["_id"])}).to_list(length=None)
    assert len(attempts) == 1
    assert attempts[0]["succeeded"] is True
    assert attempts[0]["responseCode"] == 200
    current = await webhook_repo.get_for_client(_TENANT_A, str(wh["_id"]))
    assert current["status"] == "active"


@pytest.mark.asyncio
async def test_deliver_webhook_signature_header_matches_recomputed_hmac(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo, secret="check-me")
    payload = build_payload("job.completed", wh["_id"], _TENANT_A, {"jobId": "j1"})
    patcher, fake = _patch_client([httpx.Response(200)])
    with patcher, _patch_sleep():
        await deliver_webhook(wh, "job.completed", payload, "content-1", webhook_repo, delivery_repo)
    call = fake.calls[0]
    raw_body = call["content"]
    signature = call["headers"]["X-SEEDS-Signature"]
    expected = "sha256=" + hmac.new(b"check-me", raw_body, hashlib.sha256).hexdigest()
    assert signature == expected
    assert raw_body == serialize_payload(payload)


@pytest.mark.asyncio
async def test_deliver_webhook_retries_with_exponential_backoff_then_succeeds(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    payload = build_payload("job.completed", wh["_id"], _TENANT_A, {"jobId": "j1"})
    outcomes = [httpx.Response(500), httpx.Response(502), httpx.Response(200)]
    patcher, fake = _patch_client(outcomes)
    with patcher, _patch_sleep() as sleep_mock:
        await deliver_webhook(wh, "job.completed", payload, "content-1", webhook_repo, delivery_repo)
    assert len(fake.calls) == 3
    sleep_mock.assert_any_call(WEBHOOK_RETRY_DELAYS_SECONDS[0])
    sleep_mock.assert_any_call(WEBHOOK_RETRY_DELAYS_SECONDS[1])
    assert sleep_mock.await_count == 2
    current = await webhook_repo.get_for_client(_TENANT_A, str(wh["_id"]))
    assert current["status"] == "active"
    attempts = await delivery_repo._col.find({"webhookId": str(wh["_id"])}).to_list(length=None)
    assert [a["succeeded"] for a in attempts] == [False, False, True]


@pytest.mark.asyncio
async def test_deliver_webhook_exhausts_max_attempts_then_disables(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    payload = build_payload("job.completed", wh["_id"], _TENANT_A, {"jobId": "j1"})
    outcomes = [httpx.Response(500)] * WEBHOOK_MAX_ATTEMPTS
    patcher, fake = _patch_client(outcomes)
    with patcher, _patch_sleep() as sleep_mock:
        await deliver_webhook(wh, "job.completed", payload, "content-1", webhook_repo, delivery_repo)
    assert len(fake.calls) == WEBHOOK_MAX_ATTEMPTS
    assert sleep_mock.await_count == len(WEBHOOK_RETRY_DELAYS_SECONDS)
    for i, delay in enumerate(WEBHOOK_RETRY_DELAYS_SECONDS):
        assert sleep_mock.await_args_list[i].args == (delay,)
    current = await webhook_repo.get_for_client(_TENANT_A, str(wh["_id"]))
    assert current["status"] == "disabled"
    attempts = await delivery_repo._col.find({"webhookId": str(wh["_id"])}).to_list(length=None)
    assert len(attempts) == WEBHOOK_MAX_ATTEMPTS
    assert all(a["succeeded"] is False for a in attempts)


@pytest.mark.asyncio
async def test_deliver_webhook_skips_when_already_disabled(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    await webhook_repo.disable(wh["_id"])
    disabled = await webhook_repo.get_for_client(_TENANT_A, str(wh["_id"]))
    payload = build_payload("job.completed", wh["_id"], _TENANT_A, {"jobId": "j1"})
    patcher, fake = _patch_client([])
    with patcher, _patch_sleep() as sleep_mock:
        await deliver_webhook(disabled, "job.completed", payload, "content-1", webhook_repo, delivery_repo)
    assert fake.calls == []
    sleep_mock.assert_not_called()
    attempts = await delivery_repo._col.find({"webhookId": str(wh["_id"])}).to_list(length=None)
    assert attempts == []


@pytest.mark.asyncio
async def test_deliver_webhook_skips_when_webhook_deleted_between_calls(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    await webhook_repo._col.delete_one({"_id": wh["_id"]})
    payload = build_payload("job.completed", wh["_id"], _TENANT_A, {"jobId": "j1"})
    patcher, fake = _patch_client([])
    with patcher, _patch_sleep():
        await deliver_webhook(wh, "job.completed", payload, "content-1", webhook_repo, delivery_repo)
    assert fake.calls == []


@pytest.mark.asyncio
async def test_deliver_webhook_disabled_mid_retry_stops_further_attempts(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo)
    payload = build_payload("job.completed", wh["_id"], _TENANT_A, {"jobId": "j1"})
    outcomes = [httpx.Response(500)] * WEBHOOK_MAX_ATTEMPTS

    real_sleep_target = "app.services.webhook_delivery_service.asyncio.sleep"

    async def _disable_after_first_attempt(*_a, **_kw):
        await webhook_repo.disable(wh["_id"])

    patcher, fake = _patch_client(outcomes)
    with patcher, patch(real_sleep_target, new=AsyncMock(side_effect=_disable_after_first_attempt)):
        await deliver_webhook(wh, "job.completed", payload, "content-1", webhook_repo, delivery_repo)
    assert len(fake.calls) == 1
    attempts = await delivery_repo._col.find({"webhookId": str(wh["_id"])}).to_list(length=None)
    assert len(attempts) == 1


@pytest.mark.parametrize("outcome_factory,error_substr", [
    (lambda: httpx.Response(404), "non-2xx response: 404"),
    (lambda: httpx.Response(500), "non-2xx response: 500"),
    (lambda: httpx.TimeoutException("boom"), "timeout"),
    (lambda: httpx.ConnectError("boom"), "http error"),
])
@pytest.mark.asyncio
async def test_deliver_webhook_records_error_type(webhook_repo, delivery_repo, outcome_factory, error_substr):
    wh = await _make_webhook(webhook_repo)
    payload = build_payload("job.completed", wh["_id"], _TENANT_A, {"jobId": "j1"})
    outcomes = [outcome_factory()] * WEBHOOK_MAX_ATTEMPTS
    patcher, fake = _patch_client(outcomes)
    with patcher, _patch_sleep():
        await deliver_webhook(wh, "job.completed", payload, "content-1", webhook_repo, delivery_repo)
    attempts = await delivery_repo._col.find({"webhookId": str(wh["_id"])}).to_list(length=None)
    assert all(error_substr in a["error"] for a in attempts)
    assert all(a["succeeded"] is False for a in attempts)


@pytest.mark.asyncio
async def test_deliver_webhook_delivery_log_has_no_credentials(webhook_repo, delivery_repo):
    wh = await _make_webhook(webhook_repo, secret="never-log-me")
    payload = build_payload("job.completed", wh["_id"], _TENANT_A, {"jobId": "j1"})
    patcher, fake = _patch_client([httpx.Response(200)])
    with patcher, _patch_sleep():
        await deliver_webhook(wh, "job.completed", payload, "content-1", webhook_repo, delivery_repo)
    attempts = await delivery_repo._col.find({"webhookId": str(wh["_id"])}).to_list(length=None)
    assert len(attempts) == 1
    doc = attempts[0]
    assert set(doc.keys()) == {"_id", "webhookId", "contentId", "event", "attemptedAt", "attemptNumber", "responseCode", "succeeded", "error"}
    serialized = json.dumps(doc, default=str)
    assert "never-log-me" not in serialized
    assert "sha256=" not in serialized


# ---------------------------------------------------------------------------
# dispatch_terminal_event — fan-out, tenant isolation
# ---------------------------------------------------------------------------


async def _seed_content(db, content_id, tenant_id):
    from bson import ObjectId

    await db["contentsV3"].insert_one({"_id": ObjectId(content_id), "tenant_id": tenant_id})


@pytest.mark.asyncio
async def test_dispatch_terminal_event_fanout_one_failure_does_not_block_others(db, webhook_repo, delivery_repo):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    good = await _make_webhook(webhook_repo, url="https://good.example.com/hook")
    bad = await _make_webhook(webhook_repo, url="https://bad.example.com/hook")

    async def fake_deliver(webhook_doc, *args, **kwargs):
        if webhook_doc["_id"] == bad["_id"]:
            raise RuntimeError("simulated unhandled failure")
        return None

    with patch("app.services.webhook_delivery_service.deliver_webhook", new=AsyncMock(side_effect=fake_deliver)):
        await dispatch_terminal_event(db, content_id, "job.completed", job_id="job-1")


@pytest.mark.asyncio
async def test_dispatch_terminal_event_tenant_isolation(db, webhook_repo, delivery_repo):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    wh_a = await _make_webhook(webhook_repo, client_id=_TENANT_A, url="https://a.example.com/hook")
    wh_b = await _make_webhook(webhook_repo, client_id=_TENANT_B, url="https://b.example.com/hook")

    delivered_ids = []

    async def fake_deliver(webhook_doc, *args, **kwargs):
        delivered_ids.append(webhook_doc["_id"])

    with patch("app.services.webhook_delivery_service.deliver_webhook", new=AsyncMock(side_effect=fake_deliver)):
        await dispatch_terminal_event(db, content_id, "job.completed", job_id="job-1")

    assert delivered_ids == [wh_a["_id"]]
    assert wh_b["_id"] not in delivered_ids


@pytest.mark.asyncio
async def test_dispatch_terminal_event_no_webhooks_for_event_type_is_noop(db, webhook_repo):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _make_webhook(webhook_repo, events=["content.updated"])

    with patch("app.services.webhook_delivery_service.deliver_webhook", new=AsyncMock()) as deliver_mock:
        await dispatch_terminal_event(db, content_id, "job.completed", job_id="job-1")
    deliver_mock.assert_not_called()


@pytest.mark.asyncio
async def test_dispatch_terminal_event_missing_content_never_raises(db):
    await dispatch_terminal_event(db, str((await db["contentsV3"].insert_one({"tenant_id": _TENANT_A})).inserted_id), "job.completed", job_id="job-1")


@pytest.mark.asyncio
async def test_dispatch_terminal_event_payload_data_fields(db, webhook_repo, delivery_repo):
    from bson import ObjectId

    content_id = str(ObjectId())
    await _seed_content(db, content_id, _TENANT_A)
    await _make_webhook(webhook_repo)
    captured: dict[str, Any] = {}

    async def fake_deliver(webhook_doc, event, payload, *args, **kwargs):
        captured["event"] = event
        captured["payload"] = payload

    with patch("app.services.webhook_delivery_service.deliver_webhook", new=AsyncMock(side_effect=fake_deliver)):
        await dispatch_terminal_event(db, content_id, "job.failed", job_id="job-9", error="ffmpeg exploded")

    assert captured["event"] == "job.failed"
    data = captured["payload"]["data"]
    assert data["jobId"] == "job-9"
    assert data["contentId"] == content_id
    assert data["error"] == "ffmpeg exploded"
    assert "failedAt" in data
