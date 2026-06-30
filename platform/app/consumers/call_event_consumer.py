"""Call event consumer — processes Vonage call lifecycle events from Azure Service Bus.

Ported from IVRv2/app/workers/call_processor.py CallEventProcessor.
Polls the call_event queue and calls ivr_service.process_call_event().
"""

from __future__ import annotations

import asyncio
import logging

from app.consumers.base_consumer import BaseConsumer
from app.platform.database import get_database
from app.providers.service_bus import service_bus_provider
from app.services.ivr_service import IVRService

logger = logging.getLogger(__name__)


class CallEventConsumer(BaseConsumer):
    """Polls Azure SB call_event queue → calls ivr_service.process_call_event()."""

    name = "call_event_consumer"

    POLL_BATCH = 10
    POLL_WAIT_SECONDS = 5

    async def _run_loop(self) -> None:
        db = get_database()

        # Ensure service bus is initialized
        if not service_bus_provider._initialized:
            try:
                await service_bus_provider.initialize()
            except Exception as exc:
                logger.warning(
                    "call_event_consumer: service bus init failed (%s) — retrying in 30s", exc
                )
                await asyncio.sleep(30)
                return

        while True:
            try:
                messages = await service_bus_provider.receive_messages(
                    "call_event", max_count=self.POLL_BATCH, wait_seconds=self.POLL_WAIT_SECONDS
                )
                if messages:
                    await asyncio.gather(
                        *[self._handle_one(msg, db, service_bus_provider) for msg in messages],
                        return_exceptions=True,
                    )
                else:
                    logger.debug("call_event_consumer: no messages")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("call_event_consumer: loop error — %s", exc, exc_info=True)
                await asyncio.sleep(5)

    async def _handle_one(self, msg, db, sb) -> None:
        try:
            await self.process(msg)
            await sb.complete_message("call_event", msg)
        except Exception as exc:
            logger.error("call_event_consumer: processing error — %s", exc)
            await sb.abandon_message("call_event", msg)

    async def process(self, message) -> None:
        """Process a single call event message."""
        payload = message.payload
        conversation_uuid = payload.get("conversation_uuid")
        if not conversation_uuid:
            logger.error("call_event_consumer: missing conversation_uuid in payload: %s", payload)
            return

        db = get_database()
        await IVRService(db).process_call_event(
            call_id=conversation_uuid,
            event=payload,
        )
        logger.info(
            "call_event_consumer: processed event conv=%s status=%s",
            conversation_uuid,
            payload.get("status"),
        )
