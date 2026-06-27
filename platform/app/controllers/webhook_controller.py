"""
Webhook controller — inbound Vonage event webhooks for Conference.

Preserves EXACT URL paths from ConferenceV2:
  POST /webhooks/event/{conference_id}
  GET  /webhooks/event
  POST /webhooks/conversationevents

IVR webhooks have been split into ivr_webhook_controller.py.
"""

from __future__ import annotations

import hashlib
import hmac
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

    Vonage attaches a JWT in the Authorization header signed with an internal
    Vonage key (not the application private key or API secret — we cannot
    verify the cryptographic signature). Instead we validate:
      1. JWT is well-formed with iss == "Vonage"
      2. api_key claim matches our VONAGE_API_KEY
      3. application_id claim matches our conference application
      4. payload_hash claim matches SHA-256 of the raw request body

    Not all Vonage callback types carry an Authorization header (DTMF eventUrl
    callbacks do not). When no header is present the request passes through.
    """
    auth_header: str = request.headers.get("Authorization", "")
    if not auth_header:
        return  # DTMF eventUrl callbacks don't include JWT

    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=403, detail="Invalid Authorization header")

    token = auth_header.removeprefix("Bearer ").strip()
    if not token:
        raise HTTPException(status_code=403, detail="Empty bearer token")

    try:
        # Decode without signature verification — Vonage uses an internal key
        claims = _jwt.decode(
            token,
            key="",
            algorithms=["HS256"],
            options={"verify_signature": False, "verify_aud": False},
        )
    except Exception as exc:  # noqa: BLE001
        logger.error("webhook: JWT decode failed — %s", exc)
        raise HTTPException(status_code=403, detail="Malformed webhook JWT")

    settings = get_settings()

    if claims.get("iss") != "Vonage":
        raise HTTPException(status_code=403, detail="Unexpected JWT issuer")

    if claims.get("api_key") != settings.vonage_api_key:
        raise HTTPException(status_code=403, detail="JWT api_key mismatch")

    if claims.get("application_id") not in (
        settings.vonage_conference_application_id,
        settings.vonage_ivr_application_id,
    ):
        raise HTTPException(status_code=403, detail="JWT application_id mismatch")

    payload_hash = claims.get("payload_hash", "")
    if payload_hash:
        body = await request.body()
        expected = hashlib.sha256(body).hexdigest()
        if not hmac.compare_digest(payload_hash, expected):
            raise HTTPException(status_code=403, detail="JWT payload_hash mismatch")


@router.post(
    "/event/{conference_id}",
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
    dependencies=[Depends(verify_vonage_signature)],
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
