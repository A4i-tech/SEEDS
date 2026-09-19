"""
IVR webhook controller — inbound Vonage call lifecycle events.

IVR webhooks (from IVRv2 routers/call_events.py):
  POST /event      — Vonage call lifecycle events (queued to Service Bus)
  POST /webhook    — missed-call webhook (triggers IVR start via queue)
  POST /rtc-event  — Vonage RTC/conversation events
  POST /input      — DTMF input (enqueued to Service Bus dtmf_input queue)

Security: all POST routes validate Vonage JWT via verify_vonage_signature.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.controllers.webhook_controller import verify_vonage_signature
from app.models.ivr_state import DTMFInput, EventWebhookRequest
from app.platform.database import get_database
from app.platform.settings import get_settings
from app.providers.service_bus import service_bus_provider
from app.repositories.call_repository import CallsLogRepository
from app.repositories.ivr_repository import IVRRepository
from app.services.ivr_service import IVRService, hangup_call

logger = logging.getLogger(__name__)

router = APIRouter(tags=["IVR Webhooks"])

PLACEHOLDER_DTMF_NCCO: list[dict[str, Any]] = [
    {
        "action": "input",
        "type": ["dtmf"],
        "dtmf": {"maxDigits": 1, "submitOnHash": False, "timeOut": 20},
    },
]

ENQUEUE_FAILED_NCCO: list[dict[str, Any]] = [
    {"action": "talk", "text": "Server error. Please try again later. Bye bye.", "bargeIn": False},
]


@router.post(
    "/event",
    summary="Vonage IVR call lifecycle event",
    dependencies=[Depends(verify_vonage_signature)],
)
async def ivr_event_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    """Receives Vonage call events and enqueues them for async processing."""
    try:
        req_data = await request.json()
        logger.info("ivr /event received: status=%s", req_data.get("status"))
        event = EventWebhookRequest.model_validate(req_data)
        payload = {
            "uuid": event.uuid,
            "conversation_uuid": event.conversation_uuid,
            "status": event.status.value,
            "timestamp": event.timestamp,
            "duration": event.duration,
        }
        background_tasks.add_task(_enqueue_call_event, payload)
        return {"message": "event queued for processing"}
    except Exception as exc:
        logger.warning("ivr /event parse error: %s", exc)
        return {"message": "event received", "warning": str(exc)}


@router.post(
    "/webhook",
    summary="Vonage missed-call webhook (IVR trigger)",
    dependencies=[Depends(verify_vonage_signature)],
)
async def ivr_call_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    """Receives a missed-call webhook and enqueues IVR call initiation."""
    call_data = await request.json()
    query_params = request.query_params

    if call_data.get("event_type") != "call.end":
        logger.debug("ivr /webhook: ignoring event_type=%s", call_data.get("event_type"))
        return {"detail": "Event ignored — not call.end"}

    call_status = call_data["payload"]["status"]
    phone_number = call_data["customer_identifier"]
    tenant_id = query_params.get("tenant_id", "")

    if call_status != "missed":
        logger.warning("ivr /webhook: not a missed call (status=%s)", call_status)
        return {"detail": "Invalid call data — not a missed call"}

    db = get_database()
    call_log_id = await CallsLogRepository(db).create_pending(phone_number)
    logger.info("ivr /webhook: logged missed call %s id=%s", phone_number, call_log_id)

    payload = {
        "phone_number": phone_number,
        "call_log_id": call_log_id,
        "tenant_id": tenant_id,
    }
    background_tasks.add_task(_enqueue_call_webhook, payload)
    return {
        "status_code": 200,
        "message": f"Call processing initiated for phone number: {phone_number}",
    }


@router.post(
    "/rtc-event",
    summary="Vonage RTC / conversation event (IVR)",
    dependencies=[Depends(verify_vonage_signature)],
)
async def ivr_rtc_event_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    """Handles Vonage RTC/conversation events (audio:play, audio:play:stop, etc.)."""
    event_data = await request.json()
    logger.debug("ivr /rtc-event received: type=%s", event_data.get("type"))
    background_tasks.add_task(_process_ivr_rtc_event, event_data)
    return {"message": "recorded"}


@router.post(
    "/input",
    summary="Vonage DTMF input webhook (IVR)",
    dependencies=[Depends(verify_vonage_signature)],
)
async def ivr_dtmf_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    """Receives DTMF input from Vonage and enqueues it for the DTMF consumer."""
    req_data = await request.json()
    logger.debug("ivr /input received: %s", req_data)

    try:
        dtmf_input = DTMFInput.model_validate(req_data)
    except Exception as exc:
        logger.warning("ivr /input parse error: %s", exc)
        return []

    digits = dtmf_input.dtmf.digits
    conv_id = dtmf_input.conversation_uuid
    call_leg_id = dtmf_input.uuid
    payload = {
        "conversation_uuid": conv_id,
        "call_leg_id": call_leg_id,
        "digits": digits,
        "timed_out": dtmf_input.dtmf.timed_out,
    }
    message_id = f"dtmf:{conv_id}:{call_leg_id}:{digits}:{dtmf_input.timestamp}"

    repo = IVRRepository(get_database()) if call_leg_id else None
    if repo:
        await repo.set_dtmf_waiting(call_leg_id, message_id)

    try:
        await service_bus_provider.send_dtmf_input(payload, message_id=message_id)
    except Exception as exc:
        logger.error("Failed to enqueue dtmf_input for call=%s: %s", conv_id, exc)
        return ENQUEUE_FAILED_NCCO

    if repo:
        marker = await _wait_for_dtmf_result(repo, call_leg_id, message_id)
        if marker and not marker["waiting"] and marker.get("ncco") is not None:
            if marker.get("should_hangup"):
                background_tasks.add_task(hangup_call, call_leg_id, get_settings())
            return marker["ncco"]

    placeholder = [dict(action) for action in PLACEHOLDER_DTMF_NCCO]
    placeholder[0]["eventUrl"] = [f"{get_settings().base_url}/input"]
    return placeholder


DTMF_BRIDGE_WAIT_SECONDS = 8.5
DTMF_BRIDGE_POLL_INTERVAL_SECONDS = 0.2


async def _wait_for_dtmf_result(
    repo: IVRRepository, call_leg_id: str, message_id: str
) -> dict[str, Any] | None:
    deadline = asyncio.get_event_loop().time() + DTMF_BRIDGE_WAIT_SECONDS
    while asyncio.get_event_loop().time() < deadline:
        marker = await repo.peek_dtmf_result(call_leg_id, message_id)
        if marker and not marker["waiting"] and marker.get("ncco") is not None:
            break
        await asyncio.sleep(DTMF_BRIDGE_POLL_INTERVAL_SECONDS)
    return await repo.pop_dtmf_result(call_leg_id, message_id)


async def _enqueue_call_event(payload: dict) -> None:
    try:
        await service_bus_provider.send_call_event(payload)
    except Exception as exc:
        logger.error("Failed to enqueue call_event: %s", exc)


async def _enqueue_call_webhook(payload: dict) -> None:
    try:
        await service_bus_provider.send_call_webhook(payload)
    except Exception as exc:
        logger.error("Failed to enqueue call_webhook: %s", exc)


async def _process_ivr_rtc_event(event_data: dict) -> None:
    """Process an IVR RTC event (audio:play / stop / done)."""
    try:
        db = get_database()
        await IVRService(db).process_rtc_event(event_data)
    except Exception as exc:
        logger.error("ivr RTC event processing error: %s", exc, exc_info=True)
