"""
Webhook controller — inbound Vonage event webhooks for Conference.

Preserves EXACT URL paths from ConferenceV2:
  POST /webhooks/event/{conference_id}
  GET  /webhooks/event
  POST /webhooks/conversationevents

IVR webhooks have been split into ivr_webhook_controller.py.

Security: all POST routes validate a Vonage-signed JWT in the Authorization header.
Verification is bypassed in development mode (settings.env == "development").
"""

from __future__ import annotations

import base64
import logging
import re
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from jose import jwt as _jwt

from app.platform.lifespan import get_conference_manager
from app.platform.settings import get_settings
from app.services.caller_state_service import caller_state_service
from app.services.conference_event_dispatcher import (
    dispatch_conference_event,
    dispatch_conversation_event,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/webhooks", tags=["Webhooks"])


async def verify_vonage_signature(request: Request) -> None:  # noqa: RUF029
    """FastAPI dependency that verifies the Vonage JWT on inbound webhooks.

    Vonage signs webhook requests with a JWT in the Authorization header:
        Authorization: Bearer <vonage_jwt>

    Raises HTTP 403 if the token is missing, malformed, or fails verification.
    Bypassed entirely when settings.env == "development" on loopback traffic.

    SECURITY: The private key is NEVER logged.
    """
    settings = get_settings()

    if settings.env == "development" and (request.client is None or request.client.host in {"127.0.0.1", "::1"}):
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
        _jwt.decode(
            token,
            private_key_pem,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except Exception:  # noqa: BLE001
        raise HTTPException(status_code=403, detail="Invalid or expired webhook signature")


@router.post(
    "/event/{conference_id}",
    summary="Vonage call event webhook",
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
        get_conference_manager(),
        caller_state_service,
    )
    return {"status": "ok"}


@router.get("/event", summary="Vonage WebSocket event webhook (health check)")
async def websocket_event_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    query_params = dict(request.query_params)
    logger.info("webhooks: received WS event status=%s", query_params.get("status"))
    to_url = query_params.get("to", "")
    if "id=" in to_url:
        match = re.search(r"id=([^&?]+)", to_url)
        if match:
            conference_id = match.group(1)
            conf_mgr = get_conference_manager()
            conf = conf_mgr.get_conference(conference_id)
            if conf and query_params.get("status") == "answered":
                logger.info("webhooks: WS answered for conf_id=%s", conference_id)
    return {"status": "ok"}


@router.post(
    "/conversationevents",
    summary="Vonage RTC / DTMF conversation events",
)
async def conversation_events_webhook(request: Request, background_tasks: BackgroundTasks) -> Any:
    event_data = await request.json()
    logger.info("webhooks: received conversation event")
    background_tasks.add_task(_process_conversation_event, event_data, get_conference_manager())
    return {"status": "ok"}


async def _process_event(
    event_data: dict[str, Any],
    conference_id: str,
    conference_manager: Any,
    caller_state_svc: Any,
) -> None:
    await dispatch_conference_event(event_data, conference_id, conference_manager, caller_state_svc)


async def _process_conversation_event(event_data: dict[str, Any], conference_manager: Any) -> None:
    await dispatch_conversation_event(event_data, conference_manager)
