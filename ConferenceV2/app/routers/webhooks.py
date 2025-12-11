# routers/webhooks.py

import json
from fastapi import APIRouter, Request, BackgroundTasks, HTTPException, Response
from fastapi.responses import JSONResponse
from pydantic import ValidationError
from app.models.participant import CallStatus
from app.services.confevents.mute_participant_event import MuteParticipantEvent
from app.services.confevents.vonage.vonage_call_leg_transfer_event import (
    VonageCallTransferEvent,
)
from app.services.confevents.vonage.vonage_call_status_change_event import (
    VonageCallStatusChangeEvent,
)
from app.services.confevents.vonage.vonage_dtmf_input_event import (
    VonageDTMFInputEvent,
    VonageRTCEventType,
)
from app.services.singletons.conference_call_manager import ConferenceCallManager
from typing import Dict
from app.conf_logger import logger_instance
from app.services.caller_state_manager import caller_state_manager
import asyncio

router = APIRouter()

# Import the conference_manager instance
from app.services.singletons.conference_call_manager import conference_manager

from fastapi import APIRouter, Request, Response

router = APIRouter()


@router.post("/event/{conference_id}")
async def event_webhook(
    request: Request, conference_id: str, background_tasks: BackgroundTasks
):
    event_data = await request.json()
    logger_instance.info(
        f"RECEIVED EVENT for {conference_id}: {json.dumps(event_data, indent=2)}"
    )
    background_tasks.add_task(process_event, event_data, conference_id)
    return {"status": "ok"}


@router.get("/event")
async def websocket_event_webhook(request: Request, background_tasks: BackgroundTasks):
    # This handles WebSocket connection events from Vonage connect action
    query_params = dict(request.query_params)
    logger_instance.info(f"RECEIVED WEBSOCKET EVENT: {query_params}")

    # Extract conference ID from the 'to' parameter
    to_url = query_params.get("to", "")
    if "id=" in to_url:
        # Extract conference ID from URL like: wss://...?id=conf-id
        import re

        match = re.search(r"id=([^&?]+)", to_url)
        if match:
            conference_id = match.group(1)
            logger_instance.info(
                f"Extracted conference ID from WebSocket event: {conference_id}"
            )

            # Trigger WebSocket connection for this conference
            conf = conference_manager.get_conference(conference_id)
            if conf and query_params.get("status") == "answered":
                logger_instance.info(
                    f"WebSocket connected for conference {conference_id}, triggering connection logic"
                )
                # We can trigger WebSocket connection logic here if needed

    return {"status": "ok"}


@router.post("/conversationevents")
async def conversation_events_webhook(
    request: Request, background_tasks: BackgroundTasks
):
    event_data = await request.json()
    logger_instance.info(f"CONV EVENT RECEIVED: {json.dumps(event_data, indent=2)}")
    background_tasks.add_task(process_conversation_event, event_data)
    return {"status": "ok"}


async def process_event(event_data: Dict, conference_id: str):
    conf = conference_manager.get_conference(conference_id)
    if conf:
        try:
            vonage_call_status_change_event = VonageCallStatusChangeEvent(**event_data)
            call_status_change_event = (
                vonage_call_status_change_event.get_conf_call_status_change_event(conf)
            )
            logger_instance.info(
                f"Processing call status change event for {call_status_change_event.phone_number}: {call_status_change_event.status}"
            )

            # === ENHANCED HOLD DETECTION WITH DETAILED ANALYSIS ===

            # First, analyze participant state if they exist
            if call_status_change_event.phone_number in conf.state.participants:
                participant = conf.state.participants[
                    call_status_change_event.phone_number
                ]

                print(f"\n{'*'*80}")
                print(
                    f"[HOLD DETECTION] Analyzing participant: {call_status_change_event.phone_number}"
                )
                print(
                    f"[HOLD DETECTION] Current call_status in system: {participant.call_status}"
                )
                print(
                    f"[HOLD DETECTION] New status from Vonage webhook: {vonage_call_status_change_event.status}"
                )
                print(
                    f"[HOLD DETECTION] Event direction: {getattr(vonage_call_status_change_event, 'direction', 'N/A')}"
                )
                print(
                    f"[HOLD DETECTION] Event from number: {getattr(vonage_call_status_change_event, 'from_', 'N/A')}"
                )
                print(f"[HOLD DETECTION] Checking if status change indicates HOLD...")
                print(f"{'*'*80}\n")

                logger_instance.info(
                    f"[HOLD DETECTION] Participant {call_status_change_event.phone_number} - "
                    f"Current: {participant.call_status}, New: {vonage_call_status_change_event.status}"
                )

            # HOLD DETECTION: Check if this might be a hold event (participant receiving external call)
            # If detected, use earmuff to completely isolate participant and prevent carrier hold music
            if vonage_call_status_change_event.is_potential_hold_event(conf):
                participant = conf.state.participants[
                    call_status_change_event.phone_number
                ]

                # === HOLD DETECTED - PRINT ALERT ===
                hold_alert = (
                    f"\n{'#'*80}\n"
                    f"🚨 [HOLD DETECTION] HOLD EVENT DETECTED! 🚨\n"
                    f"{'#'*80}\n"
                    f"[HOLD DETECTION] Participant: {call_status_change_event.phone_number}\n"
                    f"[HOLD DETECTION] Status transition: {participant.call_status} → {vonage_call_status_change_event.status}\n"
                    f"[HOLD DETECTION] Reason: Participant likely received external call\n"
                    f"[HOLD DETECTION] Action: Applying earmuff to block carrier hold music\n"
                    f"{'#'*80}\n"
                )
                print(hold_alert)

                logger_instance.info(
                    f"[HOLD DETECTION] ⚠️ HOLD EVENT DETECTED for {call_status_change_event.phone_number}. "
                    f"Status: {participant.call_status} → {vonage_call_status_change_event.status}"
                )

                # Use earmuff via communication API to completely block audio (including hold music)
                try:
                    print(
                        f"[HOLD ACTION] Attempting to earmuff participant {call_status_change_event.phone_number}...\n"
                    )

                    await conf.communication_api.earmuff_participant(
                        call_status_change_event.phone_number
                    )

                    success_msg = (
                        f"\n✅ [HOLD ACTION] SUCCESS! Earmuffed {call_status_change_event.phone_number}\n"
                        f"[HOLD ACTION] Carrier hold music is now BLOCKED from conference\n"
                        f"[HOLD ACTION] Other participants will NOT hear hold tones\n"
                    )
                    print(success_msg)

                    logger_instance.info(
                        f"[AUTO-EARMUFF ON HOLD] ✓ Successfully earmuffed {call_status_change_event.phone_number}"
                    )
                except AttributeError as ae:
                    # Fallback to mute if earmuff not available (though it won't stop hold music)
                    error_msg = (
                        f"\n❌ [HOLD ACTION] ERROR: Earmuff method not available\n"
                        f"[HOLD ACTION] Exception: {ae}\n"
                        f"[HOLD ACTION] Falling back to mute (WARNING: won't stop hold music!)\n"
                    )
                    print(error_msg)

                    logger_instance.warning(
                        f"[AUTO-EARMUFF ON HOLD] Earmuff not available for {call_status_change_event.phone_number}"
                    )
                    await conf.queue_event(
                        MuteParticipantEvent(
                            phone_number=call_status_change_event.phone_number,
                            conf_call=conf,
                            stream_system_message=False,
                        )
                    )
                except Exception as e:
                    error_msg = (
                        f"\n❌❌❌ [HOLD ACTION] CRITICAL ERROR earmuffing {call_status_change_event.phone_number}\n"
                        f"[HOLD ACTION] Error: {str(e)}\n"
                        f"[HOLD ACTION] ⚠️ HOLD MUSIC MAY LEAK INTO CONFERENCE!\n"
                    )
                    print(error_msg)

                    logger_instance.error(
                        f"[AUTO-EARMUFF ON HOLD] Error earmuffing {call_status_change_event.phone_number}: {e}"
                    )
            else:
                # Log when hold is NOT detected (for debugging false negatives)
                if call_status_change_event.phone_number in conf.state.participants:
                    print(
                        f"[HOLD DETECTION] ℹ️  No hold detected for {call_status_change_event.phone_number} "
                        f"(status: {vonage_call_status_change_event.status})\n"
                    )

            status_enum = call_status_change_event.status

            new_state_update = {"call_status": status_enum.name}

            logger_instance.info(
                f"[TRIGGER] Firing update for conf {conference_id} with state: {new_state_update}"
            )
            asyncio.create_task(
                caller_state_manager.update_state(
                    conference_id=conference_id,
                    participant_id=call_status_change_event.phone_number,
                    new_state=new_state_update,
                )
            )

            await conf.queue_event(call_status_change_event)

            # If a student just connected, mute the student
            student_phone_numbers = [
                student.phone_number for student in conf.state.get_students()
            ]
            if (
                call_status_change_event.status == CallStatus.CONNECTED
                and call_status_change_event.phone_number in student_phone_numbers
            ):
                await conf.queue_event(
                    MuteParticipantEvent(
                        phone_number=call_status_change_event.phone_number,
                        conf_call=conf,
                        stream_system_message=False,
                    )
                )
        except ValidationError as e:
            try:
                vonage_call_transfer_event = VonageCallTransferEvent(
                    conf_call=conf, **event_data
                )
                logger_instance.info(
                    f"QUEUING VONAGE CALL TRANSFER EVENT: {vonage_call_transfer_event}"
                )
                await conf.queue_event(vonage_call_transfer_event)
            except ValidationError as e2:
                logger_instance.info(
                    "Event data does not match any known event types.",
                    json.dumps(event_data, indent=2),
                )
            except Exception as e:
                logger_instance.error("Error ", e)
        except Exception as e:
            logger_instance.error("Error ", e)


async def process_conversation_event(event_data: Dict):
    try:
        vonage_dtmf_input_event = VonageDTMFInputEvent(**event_data)
        if vonage_dtmf_input_event.type == VonageRTCEventType.DTMF:
            conf = conference_manager.get_conference_from_phone_number(
                vonage_dtmf_input_event.get_user_phone_number()
            )
            if conf:
                dtmf_input_event = vonage_dtmf_input_event.get_conf_dtmf_input_event(
                    conf
                )
                logger_instance.info(json.dumps(event_data, indent=2))
                await conf.queue_event(dtmf_input_event)

    except:
        logger_instance.info("NOT a dtmf_input_event")
