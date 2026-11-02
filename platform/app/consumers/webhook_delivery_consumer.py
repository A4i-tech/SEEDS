from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from pymongo.asynchronous.database import AsyncDatabase

from app.consumers.base_consumer import BaseConsumer
from app.models.content_aggregator import DeliveryAttempt
from app.repositories.content_aggregator_webhook_delivery_repository import (
    ContentAggregatorWebhookDeliveryRepository,
)
from app.services.webhook_delivery_service import get_webhook_delivery_service

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 10
STALE_CLAIM_SECONDS = 180


class WebhookDeliveryConsumer(BaseConsumer):
    name = "webhook_delivery_consumer"

    def __init__(self, db: AsyncDatabase) -> None:
        self._db = db

    async def _run_loop(self) -> None:
        delivery_repo = ContentAggregatorWebhookDeliveryRepository(self._db)

        while True:
            now = datetime.now(UTC)
            stale_before = now - timedelta(seconds=STALE_CLAIM_SECONDS)
            attempt = await delivery_repo.claim_due(now, stale_before)
            if attempt is None:
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
                continue
            await self.process(attempt)

    async def process(self, message: DeliveryAttempt) -> None:
        service = get_webhook_delivery_service(self._db)
        try:
            await service.attempt_delivery(message)
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            logger.exception(
                "webhook_delivery_consumer: attempt_delivery raised attempt_id=%s webhook_id=%s "
                "content_id=%s client_id=%s",
                message.id, message.webhook_id, message.content_id, message.client_id,
            )
            await service.mark_attempt_failed(message.id, error=str(exc))
