"""DTMF consumer — processes DTMF keypress messages from Azure Service Bus.

Ported from IVRv2/app/workers/call_processor.py DtmfInputProcessor.
Polls the dtmf_input queue and calls ivr_service.process_dtmf().

Note: This consumer handles async DTMF processing; the synchronous HTTP path
(/input endpoint) handles real-time DTMF directly without this queue.
"""

from __future__ import annotations

import asyncio
import logging

from app.consumers.base_consumer import BaseConsumer
from app.platform.database import get_database
from app.providers.service_bus import service_bus_provider
from app.services import ivr_service

logger = logging.getLogger(__name__)


class DtmfConsumer(BaseConsumer):
    """Polls Azure SB dtmf_input queue → calls ivr_service.process_dtmf()."""

    name = "dtmf_consumer"

    POLL_BATCH = 10
    POLL_WAIT_SECONDS = 5

    async def _run_loop(self) -> None:
        db = get_database()

        if not service_bus_provider._initialized:
            try:
                await service_bus_provider.initialize()
            except Exception as exc:
                logger.warning(
                    "dtmf_consumer: service bus init failed (%s) — retrying in 30s", exc
                )
                await asyncio.sleep(30)
                return

        while True:
            try:
                messages = await service_bus_provider.receive_messages(
                    "dtmf_input", max_count=self.POLL_BATCH, wait_seconds=self.POLL_WAIT_SECONDS
                )
                if messages:
                    await asyncio.gather(
                        *[self._handle_one(msg, db, service_bus_provider) for msg in messages],
                        return_exceptions=True,
                    )
                else:
                    logger.debug("dtmf_consumer: no messages")
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                logger.error("dtmf_consumer: loop error — %s", exc, exc_info=True)
                await asyncio.sleep(5)

    async def _handle_one(self, msg, db, sb) -> None:
        try:
            await self.process(msg)
            await sb.complete_message("dtmf_input", msg)
        except Exception as exc:
            logger.error("dtmf_consumer: processing error — %s", exc)
            await sb.abandon_message("dtmf_input", msg)

    async def process(self, message) -> None:
        """Process a single DTMF input message."""
        payload = message.payload
        conversation_uuid = payload.get("conversation_uuid")
        digits = payload.get("digits", "")

        if not conversation_uuid:
            logger.error("dtmf_consumer: missing conversation_uuid in payload: %s", payload)
            return

        db = get_database()
        await ivr_service.process_dtmf(
            call_id=conversation_uuid,
            dtmf=digits,
            db=db,
        )
        logger.info(
            "dtmf_consumer: processed DTMF conv=%s digits=%r",
            conversation_uuid,
            digits,
        )
