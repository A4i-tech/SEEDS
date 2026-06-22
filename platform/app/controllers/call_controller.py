"""
Call controller — /call/* endpoints.

Proxies conference-call state queries to the IVR server (backend-server callRouter.js).
Stores call logs and FSM context via CallService.
"""

from __future__ import annotations

import logging
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException

from app.platform.auth.dependencies import get_current_user, require_teacher
from app.models.requests.call_requests import FsmContextRequest, LogCallRequest
from app.platform.settings import get_settings
from app.services.call_service import CallService, get_call_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/call", tags=["Calls"])


@router.get("/accessToken", summary="Get access token for conference calls")
async def get_access_token(
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    """Proxy access-token request to IVR server (backend-server callRouter.js:41)."""
    settings = get_settings()
    ivr_url = settings.ivr_server_url
    if not ivr_url:
        raise HTTPException(status_code=503, detail="IVR server URL not configured")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{ivr_url}conference_call/accessToken")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"IVR server unavailable: {exc}") from exc


@router.post("/start", summary="Start a new conference call")
async def start_call(
    body: dict[str, Any],
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    """Proxy call-start to IVR server (backend-server callRouter.js:90)."""
    settings = get_settings()
    ivr_url = settings.ivr_server_url
    if not ivr_url:
        raise HTTPException(status_code=503, detail="IVR server URL not configured")
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.post(f"{ivr_url}conference_call", json=body)
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"IVR server unavailable: {exc}") from exc


@router.get("/{conf_id}/status", summary="Get conference call status")
async def get_call_status(
    conf_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    """Proxy status query to IVR server (backend-server callRouter.js:138)."""
    settings = get_settings()
    ivr_url = settings.ivr_server_url
    if not ivr_url:
        raise HTTPException(status_code=503, detail="IVR server URL not configured")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(f"{ivr_url}conference_call/{conf_id}/status")
            resp.raise_for_status()
            return resp.json()
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=str(exc)) from exc
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"IVR server unavailable: {exc}") from exc


@router.post("/logCall", summary="Log call details")
async def log_call(
    body: LogCallRequest,
    user: dict[str, Any] = Depends(get_current_user),
    service: CallService = Depends(get_call_service),
) -> Any:
    """Save a call log entry (backend-server callRouter.js:171)."""
    return await service.log_call(body.model_dump(by_alias=True))


@router.post("/fsmContext", summary="Save FSM context for a call")
async def save_fsm_context(
    body: FsmContextRequest,
    user: dict[str, Any] = Depends(get_current_user),
    service: CallService = Depends(get_call_service),
) -> Any:
    """Save an FSM context document (backend-server callRouter.js:203)."""
    return await service.save_fsm_context(body.model_dump(by_alias=True))


@router.get("/fsmContext/{context_id}", summary="Get FSM context by ID")
async def get_fsm_context(
    context_id: str,
    user: dict[str, Any] = Depends(get_current_user),
    service: CallService = Depends(get_call_service),
) -> Any:
    """Return FSM context by ID (backend-server callRouter.js:236)."""
    return await service.get_fsm_context(context_id)


@router.get("/logCall/{call_id}", summary="Get call log by ID")
async def get_call_log(
    call_id: str,
    user: dict[str, Any] = Depends(require_teacher),
    service: CallService = Depends(get_call_service),
) -> Any:
    """Return a call log entry by ID (backend-server callRouter.js:267)."""
    return await service.get_call_log(call_id)
