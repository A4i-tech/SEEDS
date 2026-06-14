"""
Webhook controller — inbound Vonage event webhooks (IVR + Conference unified).

Preserves EXACT URL paths from ConferenceV2 and IVRv2:
  POST /webhooks/event/{conference_id}
  GET  /webhooks/event
  POST /webhooks/conversationevents

IVR webhooks (from IVRv2 routers/call_events.py):
  POST /event          — Vonage call lifecycle events (queued to Service Bus)
  POST /webhook        — missed-call webhook (triggers IVR start via queue)
  POST /rtc-event      — Vonage RTC/conversation events
  POST /dtmf           — DTMF input (enqueued to Service Bus dtmf_input queue)

Security (Phase 11):
  All POST routes validate a Vonage-signed JWT in the Authorization header.
  Verification is bypassed in development mode (settings.env == "development").
"""

from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Webhooks"])


# ---------------------------------------------------------------------------
# HMAC / JWT signature verification dependency
# ---------------------------------------------------------------------------

async def verify_vonage_signature(request: Request) -> None:  # noqa: RUF029
    """FastAPI dependency that verifies the Vonage JWT on inbound webhooks.

    Vonage signs webhook requests with a JWT in the Authorization header:
        Authorization: Bearer <vonage_jwt>

    The JWT is verified against settings.vonage_application_private_key64
    (base64-encoded PEM private key).

    Raises HTTP 403 if the token is missing, malformed, or fails verification.
    Bypassed entirely when settings.env == "development".

    SECURITY: The private key is NEVER logged.  All verification errors are
    caught and re-raised as generic 403 responses to avoid leaking internals.
    """
    from app.platform.settings import get_settings  # noqa: PLC0415

    settings = get_settings()

    # Dev bypass — allows unauthenticated webhook delivery in local dev
    if settings.env == "development":
        return

    auth_header: str = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=403, detail="Missing or invalid Authorization header")

    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=403, detail="Empty bearer token")

    private_key_b64 = settings.vonage_application_private_key64
    if not private_key_b64:
        logger.warning("webhook: vonage_application_private_key64 not set; rejecting request")
        raise HTTPException(status_code=403, detail="Webhook signature verification not configured")

    try:
        private_key_pem = base64.b64decode(private_key_b64).decode("utf-8")
    except Exception:
        logger.error("webhook: failed to decode vonage_application_private_key64")
        raise HTTPException(status_code=403, detail="Invalid signature configuration")

    try:
        from jose import jwt as _jwt  # noqa: PLC0415
        from jose.exceptions import JWTError  # noqa: PLC0415

        # Vonage uses RS256 for application JWTs
        _jwt.decode(
            token,
            private_key_pem,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except Exception:  # noqa: BLE001 — never expose verification details
        raise HTTPException(status_code=403, detail="Invalid or expired webhook signature")


# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------

def _get_conference_manager() -> Any:
    from app.platform.lifespan import get_conference_manager  # noqa: PLC0415
    return get_conference_manager()


def _get_caller_state_service() -> Any:
    from app.services.caller_state_service import caller_state_service  # noqa: PLC0415
    return caller_state_service


# ---------------------------------------------------------------------------
# Conference webhooks
# ---------------------------------------------------------------------------

@router.post(
    "/webhooks/event/{conference_id}",
    summary="Vonage call event webhook",
    dependencies=[Depends(verify_vonage_signature)],
)
async def event_webhook(
    request: Request,
    conference_id: str,
    background_tasks: BackgroundTasks,
) -> Any:
    event_data = await request.json()
    logger.info("webhooks: received event conf_id=%s", conference_id)
    background_tasks.add_task(
        _process_event,
        event_data,
        conference_id,
        _get_conference_manager(),
        _get_caller_state_service(),
    )
    return {"status": "ok"}


@router.get("/webhooks/event", summary="Vonage WebSocket event webhook (health check)")
async def websocket_event_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    query_params = dict(request.query_params)
    logger.info("webhooks: received WS event status=%s", query_params.get("status"))
    to_url = query_params.get("to", "")
    if "id=" in to_url:
        match = re.search(r"id=([^&?]+)", to_url)
        if match:
            conference_id = match.group(1)
            conf_mgr = _get_conference_manager()
            conf = conf_mgr.get_conference(conference_id)
            if conf and query_params.get("status") == "answered":
                logger.info("webhooks: WS answered for conf_id=%s", conference_id)
    return {"status": "ok"}


@router.post(
    "/webhooks/conversationevents",
    summary="Vonage RTC / DTMF conversation events",
    dependencies=[Depends(verify_vonage_signature)],
)
async def conversation_events_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    event_data = await request.json()
    logger.info("webhooks: received conversation event")
    background_tasks.add_task(_process_conversation_event, event_data, _get_conference_manager())
    return {"status": "ok"}


async def _process_event(
    event_data: dict[str, Any],
    conference_id: str,
    conference_manager: Any,
    caller_state_service: Any,
) -> None:
    from app.services.conference_event_dispatcher import dispatch_conference_event  # noqa: PLC0415

    await dispatch_conference_event(event_data, conference_id, conference_manager, caller_state_service)


async def _process_conversation_event(event_data: dict[str, Any], conference_manager: Any) -> None:
    from app.services.conference_event_dispatcher import dispatch_conversation_event  # noqa: PLC0415

    await dispatch_conversation_event(event_data, conference_manager)


# ---------------------------------------------------------------------------
# IVR webhooks (from IVRv2 routers/call_events.py)
# ---------------------------------------------------------------------------

def _get_db() -> Any:
    from app.platform.database import get_database  # noqa: PLC0415
    return get_database()


@router.post(
    "/event",
    summary="Vonage IVR call lifecycle event",
    tags=["IVR Webhooks"],
    dependencies=[Depends(verify_vonage_signature)],
)
async def ivr_event_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    """Receives Vonage call events and enqueues them for async processing.

    Enqueues to the call_event Service Bus queue for the CallEventConsumer.
    """
    try:
        req_data = await request.json()
        logger.info("ivr /event received: status=%s", req_data.get("status"))

        from app.models.ivr_state import EventWebhookRequest, IVRCallStatus  # noqa: PLC0415

        event = EventWebhookRequest.model_validate(req_data)

        payload = {
            "conversation_uuid": event.conversation_uuid,
            "status": event.status.value,
            "timestamp": event.timestamp,
            "duration": event.duration,
        }

        background_tasks.add_task(_enqueue_call_event, payload)
        return {"message": "event queued for processing"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.warning("ivr /event parse error: %s", exc)
        # Return 200 so Vonage doesn't retry — best-effort
        return {"message": "event received", "warning": str(exc)}


@router.post(
    "/webhook",
    summary="Vonage missed-call webhook (IVR trigger)",
    tags=["IVR Webhooks"],
    dependencies=[Depends(verify_vonage_signature)],
)
async def ivr_call_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    """Receives a missed-call webhook and enqueues IVR call initiation.

    Triggered by Vonage when a call is missed; enqueues to call_webhook queue.
    """
    from datetime import datetime  # noqa: PLC0415

    call_data = await request.json()
    query_params = request.query_params
    call_status = call_data.get("_su")
    phone_number = call_data.get("_cl")
    tenant_id = query_params.get("tenant_id", "")

    if call_status != 2:
        logger.warning("ivr /webhook: not a missed call (status=%s)", call_status)
        return {"detail": "Invalid call data — not a missed call"}

    db = _get_db()
    insert_result = await db["callsLog"].insert_one(
        {"phone_number": phone_number, "timestamp": datetime.now(), "status": "pending"}
    )
    call_log_id = str(insert_result.inserted_id)
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
    tags=["IVR Webhooks"],
    dependencies=[Depends(verify_vonage_signature)],
)
async def ivr_rtc_event_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    """Handles Vonage RTC/conversation events (audio:play, audio:play:stop, etc.).

    Updates IVR stream_playback info in MongoDB.
    """
    event_data = await request.json()
    logger.debug("ivr /rtc-event received: type=%s", event_data.get("type"))
    background_tasks.add_task(_process_ivr_rtc_event, event_data)
    return {"message": "recorded"}


@router.post(
    "/dtmf",
    summary="Vonage DTMF input webhook (IVR)",
    tags=["IVR Webhooks"],
    dependencies=[Depends(verify_vonage_signature)],
)
async def ivr_dtmf_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    """Receives DTMF input from Vonage and enqueues for async processing.

    Enqueues to dtmf_input Service Bus queue for the DtmfConsumer.
    Returns NCCO immediately to keep the call alive.
    """
    from app.platform.database import get_database  # noqa: PLC0415
    from app.services import ivr_service  # noqa: PLC0415
    from app.models.ivr_state import DTMFInput  # noqa: PLC0415

    req_data = await request.json()
    logger.debug("ivr /dtmf received: %s", req_data)

    try:
        dtmf_input = DTMFInput.model_validate(req_data)
        digits = dtmf_input.dtmf.digits
        conv_id = dtmf_input.conversation_uuid
    except Exception as exc:
        logger.warning("ivr /dtmf parse error: %s", exc)
        return []

    # Enqueue to Service Bus for durable async processing
    payload = {"conversation_uuid": conv_id, "digits": digits}
    background_tasks.add_task(_enqueue_dtmf_input, payload)

    # Also process synchronously for real-time NCCO response
    db = get_database()
    ncco = await ivr_service.process_dtmf(call_id=conv_id, dtmf=digits, db=db)
    return ncco


# ---------------------------------------------------------------------------
# Background task helpers
# ---------------------------------------------------------------------------

async def _enqueue_call_event(payload: dict) -> None:
    try:
        from app.providers.service_bus import service_bus_provider  # noqa: PLC0415
        await service_bus_provider.send_call_event(payload)
    except Exception as exc:
        logger.error("Failed to enqueue call_event: %s", exc)


async def _enqueue_call_webhook(payload: dict) -> None:
    try:
        from app.providers.service_bus import service_bus_provider  # noqa: PLC0415
        await service_bus_provider.send_call_webhook(payload)
    except Exception as exc:
        logger.error("Failed to enqueue call_webhook: %s", exc)


async def _enqueue_dtmf_input(payload: dict) -> None:
    try:
        from app.providers.service_bus import service_bus_provider  # noqa: PLC0415
        await service_bus_provider.send_dtmf_input(payload)
    except Exception as exc:
        logger.error("Failed to enqueue dtmf_input: %s", exc)


async def _process_ivr_rtc_event(event_data: dict) -> None:
    """Process an IVR RTC event (audio:play / stop / done)."""
    try:
        from app.models.ivr_state import ConversationRTCEventType  # noqa: PLC0415
        from app.platform.database import get_database  # noqa: PLC0415

        db = get_database()
        event_type_str = event_data.get("type", "")
        conversation_id = event_data.get("conversation_id", event_data.get("body", {}).get("conversation_id", ""))
        body = event_data.get("body", {})

        ongoing_col = db["ongoingIVRState"]

        if event_type_str == ConversationRTCEventType.AUDIO_PLAY.value:
            if "stream_url" in body and "play_id" in body:
                doc = await ongoing_col.find_one({"_id": conversation_id})
                if doc:
                    from datetime import datetime  # noqa: PLC0415
                    await ongoing_col.update_one(
                        {"_id": conversation_id},
                        {
                            "$push": {
                                "stream_playback": {
                                    "play_id": body["play_id"],
                                    "stream_url": body["stream_url"][0] if isinstance(body["stream_url"], list) else body["stream_url"],
                                    "started_at": event_data.get("timestamp", datetime.now().isoformat()),
                                }
                            }
                        },
                    )
        elif event_type_str in (
            ConversationRTCEventType.AUDIO_PLAY_STOP.value,
            ConversationRTCEventType.AUDIO_PLAY_DONE.value,
        ):
            if "play_id" in body:
                field = "stopped_at" if "stop" in event_type_str else "done_at"
                await ongoing_col.update_one(
                    {"_id": conversation_id, "stream_playback.play_id": body["play_id"]},
                    {"$set": {f"stream_playback.$.{field}": event_data.get("timestamp")}},
                )
    except Exception as exc:
        logger.error("ivr RTC event processing error: %s", exc, exc_info=True)
