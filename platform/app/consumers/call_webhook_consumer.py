"""Call webhook consumer — processes missed-call webhooks from Azure Service Bus.

Ported from IVRv2/app/workers/call_processor.py CallWebhookProcessor.
Polls the call_webhook queue, initiates IVR calls, and updates call logs.
"""

from __future__ import annotations

import asyncio
import logging

from app.consumers.base_consumer import BaseConsumer
from app.platform.database import get_database
from app.providers.service_bus import service_bus_provider
from app.repositories.call_repository import CallsLogRepository
from app.services.ivr_service import IVRService

logger = logging.getLogger(__name__)


class CallWebhookConsumer(BaseConsumer):
    """Polls Azure SB call_webhook queue → creates/updates call records and starts IVR."""

    name = "call_webhook_consumer"

    POLL_BATCH = 10
    POLL_WAIT_SECONDS = 5

    async def _run_loop(self) -> None:
        db = get_database()

        if not service_bus_provider._initialized:
            try:
                await service_bus_provider.initialize()
            except Exception as exc:
                logger.warning(
                    "call_webhook_consumer: service bus init failed (%s) — retrying in 30s", exc
                )
                await asyncio.sleep(30)
                return

        while True:
            try:
                messages = await service_bus_provider.receive_messages(
                    "call_webhook", max_count=self.POLL_BATCH, wait_seconds=self.POLL_WAIT_SECONDS
                )
                if messages:
                    await asyncio.gather(
                        *[self._handle_one(msg, db, service_bus_provider) for msg in messages],
                        return_exceptions=True,
                    )
                else:
                    logger.debug("call_webhook_consumer: no messages")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("call_webhook_consumer: loop error — %s", exc, exc_info=True)
                await asyncio.sleep(5)

    async def _handle_one(self, msg, db, sb) -> None:
        try:
            await self.process(msg)
            await sb.complete_message("call_webhook", msg)
        except Exception as exc:
            logger.error("call_webhook_consumer: processing error — %s", exc)
            await sb.abandon_message("call_webhook", msg)

    async def process(self, message) -> None:
        """Process a single call webhook message.

        Starts the IVR call and updates the call log status.
        """
        payload = message.payload
        phone_number = payload.get("phone_number")
        call_log_id = payload.get("call_log_id")
        tenant_id = payload.get("tenant_id", "")

        if not phone_number:
            logger.error("call_webhook_consumer: missing phone_number in payload: %s", payload)
            return

        db = get_database()
        response = await IVRService(db).start_call_flow(
            phone_number=phone_number,
            tenant_id=tenant_id,
        )

        if response.get("status_code") == 200 and call_log_id:
            try:
                await CallsLogRepository(db).mark_called(call_log_id)
                logger.info("call_webhook_consumer: updated call log %s", call_log_id)
            except Exception as exc:
                logger.warning(
                    "call_webhook_consumer: failed to update call log %s: %s", call_log_id, exc
                )

        logger.info(
            "call_webhook_consumer: processed phone=%s status=%s",
            phone_number,
            response.get("status_code"),
        )
