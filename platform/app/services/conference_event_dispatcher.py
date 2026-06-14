"""
Conference event dispatcher — routes Vonage webhook payloads to the correct event handler.

Ported from ConferenceV2 routers/webhooks.py process_event / process_conversation_event.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any, Dict

from pydantic import ValidationError

logger = logging.getLogger(__name__)


async def dispatch_conference_event(
    event_data: Dict[str, Any],
    conference_id: str,
    conference_manager: Any,
    caller_state_manager: Any,
) -> None:
    """Route a Vonage webhook event to the appropriate ConferenceEvent handler.

    This runs as a BackgroundTask so errors must not bubble to FastAPI.
    """
    from app.models.participant import CallStatus  # noqa: PLC0415
    from app.services.confevents.vonage.vonage_call_leg_transfer_event import VonageCallTransferEvent  # noqa: PLC0415
    from app.services.confevents.vonage.vonage_call_status_change_event import VonageCallStatusChangeEvent  # noqa: PLC0415

    conf = conference_manager.get_conference(conference_id)
    if conf is None:
        logger.warning("dispatcher: conference not found conf_id=%s", conference_id)
        return

    try:
        vonage_status_event = VonageCallStatusChangeEvent(**event_data)
        call_status_change = vonage_status_event.get_conf_call_status_change_event(conf)
        status_enum = call_status_change.status

        new_state = {
            "call_status": status_enum.value,
            "onHold": status_enum == CallStatus.ON_HOLD,
        }
        asyncio.create_task(
            caller_state_manager.update_state(
                conference_id=conference_id,
                participant_id=call_status_change.phone_number,
                new_state=new_state,
            )
        )
        await conf.queue_event(call_status_change)

    except ValidationError:
        try:
            transfer_event = VonageCallTransferEvent(conf_call=conf, **event_data)
            await conf.queue_event(transfer_event)
        except ValidationError:
            logger.info("dispatcher: event does not match any known type conf_id=%s", conference_id)
        except Exception as exc:
            logger.error("dispatcher: transfer event error conf_id=%s — %s", conference_id, exc)
    except Exception as exc:
        logger.error("dispatcher: event processing error conf_id=%s — %s", conference_id, exc)


async def dispatch_conversation_event(
    event_data: Dict[str, Any],
    conference_manager: Any,
) -> None:
    """Route a Vonage conversation event (DTMF) to the conference."""
    from app.services.confevents.vonage.vonage_dtmf_input_event import (  # noqa: PLC0415
        VonageDTMFInputEvent,
        VonageRTCEventType,
    )

    try:
        dtmf_event = VonageDTMFInputEvent(**event_data)
        if dtmf_event.type == VonageRTCEventType.DTMF:
            phone = dtmf_event.get_user_phone_number()
            conf = conference_manager.get_conference_from_phone_number(phone)
            if conf:
                await conf.queue_event(dtmf_event.get_conf_dtmf_input_event(conf))
    except Exception:
        logger.debug("dispatcher: not a DTMF input event")
