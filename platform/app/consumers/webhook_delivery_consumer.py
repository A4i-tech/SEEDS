from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from pymongo.asynchronous.database import AsyncDatabase

from app.consumers.base_consumer import BaseConsumer
from app.models.content_aggregator import DeliveryAttempt
from app.services.webhook_delivery_service import (
    WEBHOOK_HTTP_TIMEOUT_SECONDS,
    get_webhook_delivery_service,
)

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 10
STALE_CLAIM_GRACE_MULTIPLIER = 18
STALE_CLAIM_SECONDS = WEBHOOK_HTTP_TIMEOUT_SECONDS * STALE_CLAIM_GRACE_MULTIPLIER


class WebhookDeliveryConsumer(BaseConsumer):
    """Polls for due webhook delivery attempts and processes them."""

    name = "webhook_delivery_consumer"

    def __init__(self, db: AsyncDatabase) -> None:
        self._db = db

    async def _run_loop(self) -> None:
        service = get_webhook_delivery_service(self._db)

        while True:
            now = datetime.now(UTC)
            stale_before = now - timedelta(seconds=STALE_CLAIM_SECONDS)
            attempt = await service.claim_due(now, stale_before)
            if attempt is None:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                continue
            await self.process(attempt)

    async def process(self, message: DeliveryAttempt) -> None:
        attempt = message
        service = get_webhook_delivery_service(self._db)
        try:
            await service.attempt_delivery(attempt)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception(
                "WebhookDeliveryConsumer: attempt_delivery raised attemptId=%s webhookId=%s",
                attempt.id, attempt.webhook_id,
            )
            await service.mark_attempt_failed(attempt.id, error="consumer: attempt_delivery raised")
