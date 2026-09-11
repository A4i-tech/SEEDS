"""DTMF consumer — processes DTMF keypress messages from Azure Service Bus.

Polls the dtmf_input queue and calls ivr_service.process_dtmf(), then pushes
the resulting NCCO to the live call via update_call_ncco. This is the only
place DTMF input is processed — the /input webhook only enqueues.
"""

from __future__ import annotations

import asyncio
import logging

from app.consumers.base_consumer import BaseConsumer
from app.platform.database import get_database
from app.platform.settings import get_settings
from app.providers.service_bus import service_bus_provider
from app.repositories.ivr_repository import IVRRepository
from app.services.ivr_service import IVRService, hangup_call, update_call_ncco

logger = logging.getLogger(__name__)


class DtmfConsumer(BaseConsumer):
    """Polls Azure SB dtmf_input queue → calls ivr_service.process_dtmf()."""

    name = "dtmf_consumer"

    POLL_BATCH = 10
    POLL_WAIT_SECONDS = 1

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
        call_leg_id = payload.get("call_leg_id")
        digits = payload.get("digits", "")
        timed_out = payload.get("timed_out", False)

        if not conversation_uuid:
            logger.error("dtmf_consumer: missing conversation_uuid in payload: %s", payload)
            return

        db = get_database()
        if not call_leg_id:
            ivr_state = await IVRRepository(db).find_by_conversation_uuid(conversation_uuid)
            call_leg_id = ivr_state.id if ivr_state else None

        if not call_leg_id:
            logger.error(
                "dtmf_consumer: could not resolve call_leg_id for conversation_uuid=%s",
                conversation_uuid,
            )
            return

        ncco, should_hangup = await IVRService(db).process_dtmf(
            call_leg_id=call_leg_id, dtmf=digits, timed_out=timed_out
        )
        if ncco is None:
            logger.info(
                "dtmf_consumer: no NCCO to push for call_leg=%s (stale write), skipping", call_leg_id
            )
            return
        if not await update_call_ncco(call_leg_id, ncco, get_settings()):
            logger.error("dtmf_consumer: update_call_ncco failed for call_leg=%s", call_leg_id)
            return
        if should_hangup and not await hangup_call(call_leg_id, get_settings()):
            logger.error("dtmf_consumer: hangup failed for call_leg=%s", call_leg_id)
        logger.info("dtmf_consumer: processed call_leg=%s digit=%r", call_leg_id, digits)
