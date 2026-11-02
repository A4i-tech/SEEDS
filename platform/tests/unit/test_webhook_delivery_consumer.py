from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest
from bson import ObjectId

import app.services.webhook_delivery_service as webhook_delivery_service
from app.consumers.webhook_delivery_consumer import STALE_CLAIM_SECONDS, WebhookDeliveryConsumer
from app.models.content_aggregator import DeliveryStatus
from app.models.requests.webhook_registration_requests import WebhookEventType
from app.platform.auth.webhook_secret import encrypt_secret
from app.repositories.content_aggregator_webhook_delivery_repository import (
    ContentAggregatorWebhookDeliveryRepository,
)
from app.services.webhook_delivery_service import get_webhook_delivery_service
from tests.support.fake_async_client import FakeAsyncClient


@pytest.fixture(autouse=True)
def _no_retry_delay(monkeypatch):
    monkeypatch.setattr(webhook_delivery_service, "WEBHOOK_RETRY_DELAYS_SECONDS", (0, 0, 0, 0, 0))


async def _seed_webhook(db, *, status="active"):
    webhook_id = ObjectId()
    now = datetime.now(UTC)
    await db["contentAggregatorWebhooks"].insert_one({
        "_id": webhook_id, "client_id": "client-1", "url": "http://receiver.invalid/hook",
        "secret_encrypted": encrypt_secret("topsecret"), "status": status, "events": ["job.completed"],
        "created_at": now, "updated_at": now,
    })
    return webhook_id


async def _seed_pending(db, webhook_id, *, attempt_number=1, next_attempt_at=None):
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)
    return await delivery_repo.create_pending(
        webhook_id=str(webhook_id), content_id="content-1", event=WebhookEventType.JOB_COMPLETED,
        tenant_id="tenant-1", client_id="client-1",
        payload_data={"jobId": "job-1", "contentId": "content-1", "jobName": "job"},
        attempt_number=attempt_number,
        next_attempt_at=next_attempt_at or datetime.now(UTC),
    )


class _StubDeliveryService:
    def __init__(self, db, attempt_delivery) -> None:
        self._delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)
        self.attempt_delivery = attempt_delivery
        self.failed_attempt_ids: list[str] = []

    async def mark_attempt_failed(self, attempt_id, *, error) -> None:
        self.failed_attempt_ids.append(attempt_id)
        await self._delivery_repo.record_attempt_result(
            attempt_id, status=DeliveryStatus.FAILED, response_code=None, error=error,
        )


async def test_run_loop_stops_and_sleeps_when_no_due_work(monkeypatch, db):
    consumer = WebhookDeliveryConsumer(db)
    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    monkeypatch.setattr("app.consumers.webhook_delivery_consumer.asyncio.sleep", sleep_mock)

    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    sleep_mock.assert_awaited_once()


async def test_run_loop_claims_and_delivers_due_attempt(monkeypatch, db):
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)

    attempt_calls = []

    async def _fake_attempt_delivery(attempt):
        attempt_calls.append(attempt.attempt_number)

    monkeypatch.setattr(
        "app.consumers.webhook_delivery_consumer.get_webhook_delivery_service",
        lambda db: _StubDeliveryService(db, _fake_attempt_delivery),
    )
    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    monkeypatch.setattr("app.consumers.webhook_delivery_consumer.asyncio.sleep", sleep_mock)

    consumer = WebhookDeliveryConsumer(db)
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    assert attempt_calls == [1]


async def test_run_loop_survives_attempt_exception_and_keeps_polling(monkeypatch, db):
    webhook_id = await _seed_webhook(db)
    pending = await _seed_pending(db, webhook_id)

    async def _boom(attempt):
        raise RuntimeError("boom")

    stub_service = _StubDeliveryService(db, _boom)
    monkeypatch.setattr(
        "app.consumers.webhook_delivery_consumer.get_webhook_delivery_service",
        lambda db: stub_service,
    )
    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    monkeypatch.setattr("app.consumers.webhook_delivery_consumer.asyncio.sleep", sleep_mock)

    consumer = WebhookDeliveryConsumer(db)
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    sleep_mock.assert_awaited_once()
    assert stub_service.failed_attempt_ids == [pending.id]
    doc = await db["contentAggregatorWebhookDeliveries"].find_one({"_id": ObjectId(pending.id)})
    assert doc["status"] == "failed"


async def test_run_loop_processes_retries_across_claims_until_disabled(monkeypatch, db):
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)
    stop_after = webhook_delivery_service.WEBHOOK_MAX_ATTEMPTS

    fake_client = FakeAsyncClient([httpx.Response(500)] * stop_after)
    monkeypatch.setattr(
        "app.services.webhook_delivery_service.httpx.AsyncClient", lambda **kw: fake_client,
    )

    async def _stop_when_exhausted(*_a, **_kw):
        stopped_doc = await db["contentAggregatorWebhooks"].find_one({"_id": webhook_id})
        if stopped_doc["status"] == "disabled":
            raise asyncio.CancelledError
        return None

    monkeypatch.setattr(
        "app.consumers.webhook_delivery_consumer.asyncio.sleep",
        AsyncMock(side_effect=_stop_when_exhausted),
    )

    consumer = WebhookDeliveryConsumer(db)
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    deliveries = await db["contentAggregatorWebhookDeliveries"].find({}).sort("attempt_number", 1).to_list(
        length=None
    )
    assert [d["attempt_number"] for d in deliveries] == list(range(1, stop_after + 1))
    doc = await db["contentAggregatorWebhooks"].find_one({"_id": webhook_id})
    assert doc["status"] == "disabled"


async def test_claim_due_ignores_future_scheduled_work(db):
    webhook_id = await _seed_webhook(db)
    future = datetime.now(UTC) + timedelta(hours=1)
    await _seed_pending(db, webhook_id, next_attempt_at=future)

    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)
    now = datetime.now(UTC)
    assert await delivery_repo.claim_due(now, now) is None


async def test_claim_due_does_not_reclaim_claim_younger_than_threshold(db):
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)

    await _claim_then_backdate(
        db, delivery_repo, age=timedelta(seconds=STALE_CLAIM_SECONDS - 5)
    )

    now = datetime.now(UTC)
    stale_before = datetime.now(UTC) - timedelta(seconds=STALE_CLAIM_SECONDS)
    reclaimed = await delivery_repo.claim_due(now, stale_before)
    assert reclaimed is None


async def _claim_then_backdate(db, delivery_repo, *, age=timedelta(hours=1)):
    now = datetime.now(UTC)
    claimed = await delivery_repo.claim_due(now, now)
    stale_claim_time = datetime.now(UTC) - age
    await db["contentAggregatorWebhookDeliveries"].update_one(
        {"_id": ObjectId(claimed.id)}, {"$set": {"claimed_at": stale_claim_time}}
    )
    return claimed, stale_claim_time


async def test_claim_due_reclaims_stale_claimed_record(db):
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)

    first, _ = await _claim_then_backdate(
        db, delivery_repo, age=timedelta(seconds=STALE_CLAIM_SECONDS + 5)
    )

    now = datetime.now(UTC)
    stale_before = datetime.now(UTC) - timedelta(seconds=STALE_CLAIM_SECONDS)
    reclaimed = await delivery_repo.claim_due(now, stale_before)
    assert reclaimed is not None
    assert reclaimed.id == first.id
    doc = await db["contentAggregatorWebhookDeliveries"].find_one({"_id": ObjectId(reclaimed.id)})
    assert abs((doc["claimed_at"] - now.replace(tzinfo=None)).total_seconds()) < 1
    assert reclaimed.attempt_number == first.attempt_number

    second_reclaim = await delivery_repo.claim_due(now, stale_before)
    assert second_reclaim is None


async def test_stale_claim_recovery_end_to_end_via_run_loop(monkeypatch, db):
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)

    crashed_attempt, stale_claim_time = await _claim_then_backdate(db, delivery_repo)
    assert stale_claim_time < datetime.now(UTC)

    service = get_webhook_delivery_service(db)
    monkeypatch.setattr(
        "app.consumers.webhook_delivery_consumer.get_webhook_delivery_service",
        lambda db: service,
    )
    fake_client = FakeAsyncClient([httpx.Response(200)])
    monkeypatch.setattr(
        "app.services.webhook_delivery_service.httpx.AsyncClient", lambda **kw: fake_client,
    )
    consumer = WebhookDeliveryConsumer(db)
    monkeypatch.setattr(
        "app.consumers.webhook_delivery_consumer.asyncio.sleep",
        AsyncMock(side_effect=asyncio.CancelledError),
    )
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    doc = await db["contentAggregatorWebhookDeliveries"].find_one({"_id": ObjectId(crashed_attempt.id)})
    assert doc["attempt_number"] == 1
    assert doc["status"] != "claimed"
