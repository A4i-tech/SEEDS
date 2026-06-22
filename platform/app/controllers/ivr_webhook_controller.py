"""
IVR webhook controller — inbound Vonage call lifecycle events.

IVR webhooks (from IVRv2 routers/call_events.py):
  POST /event      — Vonage call lifecycle events (queued to Service Bus)
  POST /webhook    — missed-call webhook (triggers IVR start via queue)
  POST /rtc-event  — Vonage RTC/conversation events
  POST /dtmf       — DTMF input (enqueued to Service Bus dtmf_input queue)

Security: all POST routes validate Vonage JWT via verify_vonage_signature.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Request

from app.controllers.webhook_controller import verify_vonage_signature
from app.models.ivr_state import (
    ConversationRTCEventType,
    DTMFInput,
    EventWebhookRequest,
)
from app.platform.database import get_database
from app.providers.service_bus import service_bus_provider
from app.repositories.call_repository import CallsLogRepository
from app.repositories.ivr_repository import IVRRepository
from app.services.ivr_service import IVRService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["IVR Webhooks"])


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
    call_status = call_data.get("_su")
    phone_number = call_data.get("_cl")
    tenant_id = query_params.get("tenant_id", "")

    if call_status != 2:
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
    "/dtmf",
    summary="Vonage DTMF input webhook (IVR)",
    dependencies=[Depends(verify_vonage_signature)],
)
async def ivr_dtmf_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    """Receives DTMF input from Vonage and enqueues for async processing."""
    req_data = await request.json()
    logger.debug("ivr /dtmf received: %s", req_data)

    try:
        dtmf_input = DTMFInput.model_validate(req_data)
        digits = dtmf_input.dtmf.digits
        conv_id = dtmf_input.conversation_uuid
    except Exception as exc:
        logger.warning("ivr /dtmf parse error: %s", exc)
        return []

    payload = {"conversation_uuid": conv_id, "digits": digits}
    background_tasks.add_task(_enqueue_dtmf_input, payload)

    db = get_database()
    ncco = await IVRService(db).process_dtmf(call_id=conv_id, dtmf=digits)
    return ncco


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


async def _enqueue_dtmf_input(payload: dict) -> None:
    try:
        await service_bus_provider.send_dtmf_input(payload)
    except Exception as exc:
        logger.error("Failed to enqueue dtmf_input: %s", exc)


async def _process_ivr_rtc_event(event_data: dict) -> None:
    """Process an IVR RTC event (audio:play / stop / done)."""
    try:
        db = get_database()
        repo = IVRRepository(db)
        event_type_str = event_data.get("type", "")
        conversation_id = event_data.get("conversation_id", event_data.get("body", {}).get("conversation_id", ""))
        body = event_data.get("body", {})

        if event_type_str == ConversationRTCEventType.AUDIO_PLAY.value:
            if "stream_url" in body and "play_id" in body:
                doc = await repo.find_ongoing_state(conversation_id)
                if doc:
                    stream_url = body["stream_url"]
                    await repo.push_stream_playback(conversation_id, {
                        "play_id": body["play_id"],
                        "stream_url": stream_url[0] if isinstance(stream_url, list) else stream_url,
                        "started_at": event_data.get("timestamp", datetime.now(timezone.utc).isoformat()),
                    })
        elif event_type_str in (
            ConversationRTCEventType.AUDIO_PLAY_STOP.value,
            ConversationRTCEventType.AUDIO_PLAY_DONE.value,
        ):
            if "play_id" in body:
                field = "stopped_at" if "stop" in event_type_str else "done_at"
                await repo.set_playback_field(
                    conversation_id, body["play_id"], field, event_data.get("timestamp")
                )
    except Exception as exc:
        logger.error("ivr RTC event processing error: %s", exc, exc_info=True)
