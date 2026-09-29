from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest
from bson import ObjectId

import app.services.webhook_delivery_service as webhook_delivery_service
from app.consumers.webhook_delivery_consumer import STALE_CLAIM_SECONDS, WebhookDeliveryConsumer
from app.repositories.content_aggregator_webhook_delivery_repository import (
    ContentAggregatorWebhookDeliveryRepository,
)
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture(autouse=True)
def _no_retry_delay(monkeypatch):
    monkeypatch.setattr(webhook_delivery_service, "WEBHOOK_RETRY_DELAYS_SECONDS", (0, 0, 0, 0, 0))


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


async def _seed_webhook(db, *, status="active"):
    webhook_id = ObjectId()
    await db["contentAggregatorWebhooks"].insert_one({
        "_id": webhook_id, "client_id": "client-1", "url": "http://receiver.invalid/hook",
        "secret_encrypted": "enc", "status": status, "events": ["job.completed"],
    })
    return webhook_id


async def _seed_pending(db, webhook_id, *, attempt_number=1, next_attempt_at=None):
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)
    return await delivery_repo.create_pending(
        webhook_id=webhook_id, content_id="content-1", event="job.completed",
        tenant_id="tenant-1", client_id="client-1", payload_data={"jobId": "job-1"},
        attempt_number=attempt_number,
        next_attempt_at=(next_attempt_at or datetime.now(UTC)).isoformat(),
    )


async def test_run_loop_stops_and_sleeps_when_no_due_work(monkeypatch, db):
    consumer = WebhookDeliveryConsumer(db)
    consumer._running = True
    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    monkeypatch.setattr("app.consumers.webhook_delivery_consumer.asyncio.sleep", sleep_mock)

    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    sleep_mock.assert_awaited_once()


async def test_run_loop_claims_and_delivers_due_attempt(monkeypatch, db):
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)

    attempt_calls = []

    async def _fake_attempt_delivery(attempt_doc, webhook_repo, delivery_repo):
        attempt_calls.append(attempt_doc["attemptNumber"])
        await delivery_repo.record_attempt_result(
            attempt_doc["_id"], status="succeeded", response_code=200, succeeded=True, error=None,
        )

    monkeypatch.setattr(
        "app.consumers.webhook_delivery_consumer.attempt_delivery", _fake_attempt_delivery,
    )
    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    monkeypatch.setattr("app.consumers.webhook_delivery_consumer.asyncio.sleep", sleep_mock)

    consumer = WebhookDeliveryConsumer(db)
    consumer._running = True
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    assert attempt_calls == [1]


async def test_run_loop_survives_attempt_exception_and_keeps_polling(monkeypatch, db):
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)

    async def _boom(attempt_doc, webhook_repo, delivery_repo):
        raise RuntimeError("boom")

    monkeypatch.setattr("app.consumers.webhook_delivery_consumer.attempt_delivery", _boom)
    sleep_mock = AsyncMock(side_effect=asyncio.CancelledError)
    monkeypatch.setattr("app.consumers.webhook_delivery_consumer.asyncio.sleep", sleep_mock)

    consumer = WebhookDeliveryConsumer(db)
    consumer._running = True
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    sleep_mock.assert_awaited_once()


async def test_run_loop_processes_retries_across_claims_until_disabled(monkeypatch, db):
    """One claim = one attempt; a failing attempt's rescheduled pending record
    is picked up by the NEXT loop iteration, not retried in-process."""
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)
    webhook_repo = ContentAggregatorWebhookRepository(db)

    async def _real_attempt_delivery(attempt_doc, wh_repo, dv_repo):
        await delivery_repo.record_attempt_result(
            attempt_doc["_id"], status="failed", response_code=500, succeeded=False, error="boom",
        )
        if attempt_doc["attemptNumber"] < webhook_delivery_service.WEBHOOK_MAX_ATTEMPTS:
            await delivery_repo.create_pending(
                webhook_id=webhook_id, content_id="content-1", event="job.completed",
                tenant_id="tenant-1", client_id="client-1", payload_data={"jobId": "job-1"},
                attempt_number=attempt_doc["attemptNumber"] + 1,
                next_attempt_at=datetime.now(UTC).isoformat(),
            )
        else:
            await webhook_repo.disable(webhook_id)

    monkeypatch.setattr(
        "app.consumers.webhook_delivery_consumer.attempt_delivery", _real_attempt_delivery,
    )
    stop_after = webhook_delivery_service.WEBHOOK_MAX_ATTEMPTS

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
    consumer._running = True
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    deliveries = await db["contentAggregatorWebhookDeliveries"].find({}).sort("attemptNumber", 1).to_list(
        length=None
    )
    assert [d["attemptNumber"] for d in deliveries] == list(range(1, stop_after + 1))
    doc = await db["contentAggregatorWebhooks"].find_one({"_id": webhook_id})
    assert doc["status"] == "disabled"


async def test_pending_work_survives_across_consumer_restart(db):
    """A newly-constructed consumer/repo pair can still claim work created
    before it existed — the durable pending record IS the restart recovery."""
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)

    second_consumer = WebhookDeliveryConsumer(db)
    second_consumer_repo = ContentAggregatorWebhookDeliveryRepository(second_consumer._db)
    now_iso = datetime.now(UTC).isoformat()
    claimed = await second_consumer_repo.claim_due(now_iso, now_iso)
    assert claimed is not None
    assert claimed["webhookId"] == str(webhook_id)


async def test_claim_due_ignores_future_scheduled_work(db):
    webhook_id = await _seed_webhook(db)
    future = datetime.now(UTC) + timedelta(hours=1)
    await _seed_pending(db, webhook_id, next_attempt_at=future)

    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)
    now_iso = datetime.now(UTC).isoformat()
    assert await delivery_repo.claim_due(now_iso, now_iso) is None


def test_stale_claim_seconds_is_180():
    """STALE_CLAIM_SECONDS must stay derived from the existing HTTP timeout
    (no new config) and resolve to a 3-minute grace period, not the raw
    10s HTTP timeout (too aggressive — can reclaim a still-running attempt)."""
    assert STALE_CLAIM_SECONDS == webhook_delivery_service.WEBHOOK_HTTP_TIMEOUT_SECONDS * 18
    assert STALE_CLAIM_SECONDS == 180.0


async def test_claim_due_does_not_reclaim_fresh_claimed_record(db):
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)

    now_iso = datetime.now(UTC).isoformat()
    first = await delivery_repo.claim_due(now_iso, now_iso)
    assert first is not None
    assert first["status"] == "claimed"
    assert first["claimedAt"] == now_iso
    assert first["attemptNumber"] == 1

    stale_before = (datetime.now(UTC) - timedelta(seconds=STALE_CLAIM_SECONDS)).isoformat()
    second = await delivery_repo.claim_due(datetime.now(UTC).isoformat(), stale_before)
    assert second is None


async def test_claim_due_does_not_reclaim_claim_younger_than_threshold(db):
    """A claim just under the 180s threshold (e.g. a still-running HTTP
    attempt within the 10s timeout) must NOT be reclaimed."""
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)

    await _claim_then_backdate(
        db, delivery_repo, age=timedelta(seconds=STALE_CLAIM_SECONDS - 5)
    )

    now_iso = datetime.now(UTC).isoformat()
    stale_before = (datetime.now(UTC) - timedelta(seconds=STALE_CLAIM_SECONDS)).isoformat()
    reclaimed = await delivery_repo.claim_due(now_iso, stale_before)
    assert reclaimed is None


async def _claim_then_backdate(db, delivery_repo, *, age=timedelta(hours=1)):
    """Claim the due record normally, then rewrite claimedAt to simulate a
    consumer that claimed it and then crashed before recording a result."""
    now_iso = datetime.now(UTC).isoformat()
    claimed = await delivery_repo.claim_due(now_iso, now_iso)
    stale_claim_time = (datetime.now(UTC) - age).isoformat()
    await db["contentAggregatorWebhookDeliveries"].update_one(
        {"_id": claimed["_id"]}, {"$set": {"claimedAt": stale_claim_time}}
    )
    claimed["claimedAt"] = stale_claim_time
    return claimed


async def test_claim_due_reclaims_stale_claimed_record(db):
    """A claim older than the 180s threshold must be reclaimed."""
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)

    first = await _claim_then_backdate(
        db, delivery_repo, age=timedelta(seconds=STALE_CLAIM_SECONDS + 5)
    )

    now_iso = datetime.now(UTC).isoformat()
    stale_before = (datetime.now(UTC) - timedelta(seconds=STALE_CLAIM_SECONDS)).isoformat()
    reclaimed = await delivery_repo.claim_due(now_iso, stale_before)
    assert reclaimed is not None
    assert reclaimed["_id"] == first["_id"]
    assert reclaimed["claimedAt"] == now_iso
    assert reclaimed["attemptNumber"] == first["attemptNumber"]


async def test_two_claims_cannot_claim_the_same_stale_record(db):
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)

    await _claim_then_backdate(
        db, delivery_repo, age=timedelta(seconds=STALE_CLAIM_SECONDS + 5)
    )

    now_iso = datetime.now(UTC).isoformat()
    stale_before = (datetime.now(UTC) - timedelta(seconds=STALE_CLAIM_SECONDS)).isoformat()
    reclaimed = await delivery_repo.claim_due(now_iso, stale_before)
    second_reclaim = await delivery_repo.claim_due(now_iso, stale_before)
    assert reclaimed is not None
    assert second_reclaim is None


async def test_stale_claim_recovery_end_to_end_via_run_loop(monkeypatch, db):
    """A consumer that claims a record then crashes leaves it "claimed"; a
    later poll must reclaim and deliver it without bumping attemptNumber."""
    webhook_id = await _seed_webhook(db)
    await _seed_pending(db, webhook_id)
    delivery_repo = ContentAggregatorWebhookDeliveryRepository(db)

    crashed_attempt = await _claim_then_backdate(db, delivery_repo)
    assert crashed_attempt["claimedAt"] < datetime.now(UTC).isoformat()

    consumer = WebhookDeliveryConsumer(db)
    consumer._running = True
    monkeypatch.setattr(
        "app.consumers.webhook_delivery_consumer.asyncio.sleep",
        AsyncMock(side_effect=asyncio.CancelledError),
    )
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    doc = await db["contentAggregatorWebhookDeliveries"].find_one({"_id": crashed_attempt["_id"]})
    assert doc["attemptNumber"] == 1
    assert doc["status"] != "claimed"
