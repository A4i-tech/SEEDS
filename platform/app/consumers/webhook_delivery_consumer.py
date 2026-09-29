"""Webhook delivery consumer (ticket #464).

Polls contentAggregatorWebhookDeliveries for durable pending delivery
attempts and executes exactly one HTTP attempt per claimed record. Retry
scheduling, exhaustion, and webhook auto-disable are handled inside
``attempt_delivery`` (see webhook_delivery_service.py). Because pending
work is persisted before delivery starts, a process restart cannot lose an
in-flight retry — the next poll simply claims it again once due.

To be started as an asyncio background task from the lifespan.
"""
from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.content_aggregator_webhook_delivery_repository import (
    ContentAggregatorWebhookDeliveryRepository,
)
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from app.services.webhook_delivery_service import WEBHOOK_HTTP_TIMEOUT_SECONDS, attempt_delivery

logger = logging.getLogger(__name__)

POLL_INTERVAL_SECONDS = 10
STALE_CLAIM_SECONDS = WEBHOOK_HTTP_TIMEOUT_SECONDS * 18


class WebhookDeliveryConsumer:
    """Polls for due webhook delivery attempts and processes them."""

    def __init__(self, db: AsyncDatabase) -> None:
        self._db = db
        self._running = False

    async def run(self) -> None:
        """Start the polling loop (alias for lifespan compatibility)."""
        await self.start()

    async def start(self) -> None:
        self._running = True
        logger.info("WebhookDeliveryConsumer: started")
        try:
            await self._run_loop()
        except asyncio.CancelledError:
            logger.info("WebhookDeliveryConsumer: cancelled")
        finally:
            self._running = False

    async def stop(self) -> None:
        self._running = False

    async def _run_loop(self) -> None:
        webhook_repo = ContentAggregatorWebhookRepository(self._db)
        delivery_repo = ContentAggregatorWebhookDeliveryRepository(self._db)

        while self._running:
            try:
                now = datetime.now(UTC)
                stale_before = now - timedelta(seconds=STALE_CLAIM_SECONDS)
                attempt_doc = await delivery_repo.claim_due(
                    now.isoformat(), stale_before.isoformat()
                )
                if attempt_doc is None:
                    await asyncio.sleep(POLL_INTERVAL_SECONDS)
                    continue
                await attempt_delivery(attempt_doc, webhook_repo, delivery_repo)
            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001 — keep the poll loop alive
                logger.exception("WebhookDeliveryConsumer: unexpected error in loop — %s", exc)
                await asyncio.sleep(POLL_INTERVAL_SECONDS)
