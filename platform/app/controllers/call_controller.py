"""
Call controller — /call/* and /conference/* endpoints.

Ported from backend-server/src/routes/callRouter.js and ConferenceV2 routers/conference.py.

Preserves ALL original URL paths exactly:
  GET  /call/accessToken
  POST /call/start
  GET  /call/{confId}/status
  POST /call/logCall
  POST /call/fsmContext
  GET  /call/fsmContext/{contextId}
  GET  /call/logCall/{callId}

  POST /conference/test-createstart
  POST /conference/create
  POST /conference/start/{conference_id}
  GET  /conference/teacherappconnect/{conference_id}
  POST /conference/teacherappdisconnect/{conference_id}
  PUT  /conference/end/{conference_id}
  PUT  /conference/sink/{conference_id}
"""

from __future__ import annotations

import logging
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel

from app.platform.auth.dependencies import (
    get_current_user,
    get_db,
    require_teacher,
    require_conference_owner,
)
from app.platform.error_handling import NotFoundError
from app.repositories.call_repository import CallRepository

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Calls"])


# ---------------------------------------------------------------------------
# Conference request schema
# ---------------------------------------------------------------------------

class CreateConferenceRequest(BaseModel):
    teacher_phone: str
    teacher_name: Optional[str] = None
    student_phones: List[str]
    student_names: Optional[List[Optional[str]]] = None
    leader_phone: Optional[str] = None


def _get_conf_mgr() -> Any:
    from app.platform.lifespan import get_conference_manager  # noqa: PLC0415
    return get_conference_manager()


def _get_conf_or_404(conference_id: str) -> Any:
    mgr = _get_conf_mgr()
    conf = mgr.get_conference(conference_id)
    if conf is None:
        raise HTTPException(status_code=404, detail="Conference not found")
    return conf


# ---------------------------------------------------------------------------
# Conference lifecycle routes (from ConferenceV2 routers/conference.py)
# ---------------------------------------------------------------------------

@router.post("/conference/test-createstart", summary="Create and immediately start a conference (test)")
async def create_start_conference(request: CreateConferenceRequest) -> Any:
    mgr = _get_conf_mgr()
    conf = await mgr.create_conference(
        request.teacher_phone,
        request.student_phones,
        request.leader_phone,
        teacher_name=request.teacher_name,
        student_names=request.student_names,
    )
    await mgr.start_conference_call(conf.conf_id)
    return {"status": "STARTED", "id": conf.conf_id}


@router.post("/conference/create", summary="Create a new conference call", status_code=201)
async def create_conference(
    request: CreateConferenceRequest,
    user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    mgr = _get_conf_mgr()
    conf = await mgr.create_conference(
        request.teacher_phone,
        request.student_phones,
        request.leader_phone,
        teacher_name=request.teacher_name,
        student_names=request.student_names,
    )
    # Persist conference ownership to MongoDB for require_conference_owner checks
    from datetime import datetime, timezone  # noqa: PLC0415
    await db["conferences"].insert_one({
        "_id": conf.conf_id,
        "created_by": user.get("sub", ""),
        "teacher_phone": request.teacher_phone,
        "created_at": datetime.now(timezone.utc),
    })
    return {"status": "CREATED", "id": conf.conf_id}


@router.post("/conference/start/{conference_id}", summary="Start a conference call")
async def start_conference(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    mgr = _get_conf_mgr()
    await mgr.start_conference_call(conference_id)
    return {"status": "STARTED", "id": conference_id}


@router.get("/conference/teacherappconnect/{conference_id}", summary="Connect teacher smartphone")
async def connect_smartphone(
    conference_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    conf = _get_conf_or_404(conference_id)
    return await conf.connect_smartphone()


@router.post("/conference/teacherappdisconnect/{conference_id}", summary="Disconnect teacher smartphone")
async def disconnect_smartphone(
    conference_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    conf = _get_conf_or_404(conference_id)
    return await conf.disconnect_smartphone()


@router.put("/conference/end/{conference_id}", summary="End a conference call")
async def end_conference(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.end_conf_event import EndConferenceEvent  # noqa: PLC0415

    conf = _get_conf_or_404(conference_id)
    await conf.queue_event(EndConferenceEvent(conf_call=conf))
    return {"message": "Event Queued for execution"}


@router.put("/conference/sink/{conference_id}", summary="Sink (clean up) a conference call")
async def sink_conference(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.sink_conf_event import SinkConferenceEvent  # noqa: PLC0415

    mgr = _get_conf_mgr()
    conf = _get_conf_or_404(conference_id)
    if not conf.is_queue_processing():
        conf.start_processing_conf_events_from_queue()
    await conf.queue_event(
        SinkConferenceEvent(
            conf_call=conf,
            on_sink_callback=lambda: mgr.delete_conference(conference_id),
        )
    )
    return {"message": "Event Queued for execution"}


# ---------------------------------------------------------------------------
# GET /call/accessToken  — proxy to IVR server (legacy, backend-server origin)
# ---------------------------------------------------------------------------

@router.get("/call/accessToken", summary="Get access token for conference calls")
async def get_access_token(
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    """Proxy access-token request to the IVR server.

    Maintained for backward compatibility with backend-server.
    """
    import httpx  # noqa: PLC0415
    from app.platform.settings import get_settings  # noqa: PLC0415

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


# ---------------------------------------------------------------------------
# POST /call/start  — proxy to IVR server
# ---------------------------------------------------------------------------

@router.post("/call/start", summary="Start a new conference call")
async def start_call(
    body: dict[str, Any],
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    """Proxy call-start request to the IVR server."""
    import httpx  # noqa: PLC0415
    from app.platform.settings import get_settings  # noqa: PLC0415

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


# ---------------------------------------------------------------------------
# GET /call/{confId}/status  — proxy to IVR server
# ---------------------------------------------------------------------------

@router.get("/call/{conf_id}/status", summary="Get conference call status")
async def get_call_status(
    conf_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    """Return the status of a conference call by conference ID."""
    import httpx  # noqa: PLC0415
    from app.platform.settings import get_settings  # noqa: PLC0415

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


# ---------------------------------------------------------------------------
# POST /call/logCall  — save call log entry
# ---------------------------------------------------------------------------

@router.post("/call/logCall", summary="Log call details")
async def log_call(
    body: dict[str, Any],
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Save a call log entry to the database."""
    from datetime import datetime, timezone  # noqa: PLC0415

    doc: dict = {
        **body,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db["calllogs"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


# ---------------------------------------------------------------------------
# POST /call/fsmContext  — save FSM context
# ---------------------------------------------------------------------------

@router.post("/call/fsmContext", summary="Save FSM context for a call")
async def save_fsm_context(
    body: dict[str, Any],
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Save an FSM context document."""
    from datetime import datetime, timezone  # noqa: PLC0415

    doc: dict = {
        **body,
        "created_at": datetime.now(timezone.utc),
    }
    result = await db["fsmcontexts"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


# ---------------------------------------------------------------------------
# GET /call/fsmContext/{contextId}  — get FSM context
# ---------------------------------------------------------------------------

@router.get("/call/fsmContext/{context_id}", summary="Get FSM context by ID")
async def get_fsm_context(
    context_id: str,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Return an FSM context document by ID."""
    from bson import ObjectId  # noqa: PLC0415

    try:
        oid = ObjectId(context_id)
    except Exception:
        oid = context_id  # type: ignore[assignment]

    doc = await db["fsmcontexts"].find_one({"_id": oid})
    if not doc:
        raise NotFoundError("FsmContext", context_id)
    doc["_id"] = str(doc["_id"])
    return doc


# ---------------------------------------------------------------------------
# GET /call/logCall/{callId}  — get call log
# ---------------------------------------------------------------------------

@router.get("/call/logCall/{call_id}", summary="Get call log by ID")
async def get_call_log(
    call_id: str,
    user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Return a call log entry by ID.

    Requires teacher-level authentication.
    """
    from bson import ObjectId  # noqa: PLC0415

    try:
        oid = ObjectId(call_id)
    except Exception:
        oid = call_id  # type: ignore[assignment]

    doc = await db["calllogs"].find_one({"_id": oid})
    if not doc:
        raise NotFoundError("CallLog", call_id)
    doc["_id"] = str(doc["_id"])
    return doc


# ---------------------------------------------------------------------------
# IVR routes (from IVRv2 routers/call_management.py)
# POST /start-call  — Vonage triggers this to initiate IVR
# POST /transfer    — Transfer an active IVR call
# POST /hangup      — Hangup an active IVR call
# GET  /answer      — Vonage answer webhook (public, no auth)
# ---------------------------------------------------------------------------

class StartCallRequest(BaseModel):
    phone_number: str
    tenant_id: Optional[str] = None


class TransferCallRequest(BaseModel):
    call_id: str
    transfer_to: str


class HangupRequest(BaseModel):
    call_id: str


@router.get(
    "/answer",
    summary="Vonage answer webhook — returns initial NCCO",
    tags=["IVR"],
)
async def ivr_answer() -> Any:
    """Public endpoint — Vonage calls this when a new call is answered.

    Returns a minimal NCCO to confirm the call is live.
    """
    return [
        {
            "action": "talk",
            "text": "Hello from SEEDS IVR!",
            "bargeIn": True,
            "loop": 1,
        }
    ]


@router.post(
    "/start-call",
    summary="Start a new IVR call",
    tags=["IVR"],
)
async def start_ivr_call(
    request: StartCallRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Vonage webhook — initiates an IVR call to a phone number.

    Requires tenant auth for management endpoints.
    """
    from app.services import ivr_service  # noqa: PLC0415

    response = await ivr_service.start_call_flow(
        phone_number=request.phone_number,
        tenant_id=request.tenant_id or "",
        db=db,
    )
    if response.get("status_code", 500) >= 400:
        raise HTTPException(
            status_code=response["status_code"],
            detail=response.get("message", "Failed to start call"),
        )
    return response


@router.post(
    "/transfer",
    summary="Transfer an active IVR call",
    tags=["IVR"],
)
async def transfer_ivr_call(
    request: TransferCallRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Transfer an ongoing IVR call to a different number or context."""
    # Transfer logic: retrieve call state and issue Vonage transfer NCCO
    import vonage  # noqa: PLC0415
    import base64  # noqa: PLC0415
    from app.platform.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    if not settings.vonage_application_private_key64:
        raise HTTPException(status_code=503, detail="Vonage not configured")

    raw_key = base64.b64decode(settings.vonage_application_private_key64).decode("utf-8")
    client = vonage.Client(
        application_id=settings.vonage_application_id,
        private_key=raw_key,
    )
    try:
        resp = client.voice.transfer(
            request.call_id,
            {
                "action": "transfer",
                "destination": {
                    "type": "ncco",
                    "ncco": [
                        {
                            "action": "connect",
                            "endpoint": [
                                {"type": "phone", "number": request.transfer_to}
                            ],
                        }
                    ],
                },
            },
        )
        return {"message": "Transfer initiated", "response": resp}
    except Exception as exc:
        logger.error("Transfer failed for call %s: %s", request.call_id, exc)
        raise HTTPException(status_code=500, detail=f"Transfer failed: {exc}") from exc


@router.post(
    "/hangup",
    summary="Hangup an active IVR call",
    tags=["IVR"],
)
async def hangup_ivr_call(
    request: HangupRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Terminate an ongoing IVR call."""
    import vonage  # noqa: PLC0415
    import base64  # noqa: PLC0415
    from app.platform.settings import get_settings  # noqa: PLC0415

    settings = get_settings()
    if not settings.vonage_application_private_key64:
        raise HTTPException(status_code=503, detail="Vonage not configured")

    raw_key = base64.b64decode(settings.vonage_application_private_key64).decode("utf-8")
    client = vonage.Client(
        application_id=settings.vonage_application_id,
        private_key=raw_key,
    )
    try:
        client.voice.update_call(request.call_id, {"action": "hangup"})
        return {"message": f"Hangup initiated for {request.call_id}"}
    except Exception as exc:
        logger.error("Hangup failed for call %s: %s", request.call_id, exc)
        raise HTTPException(status_code=500, detail=f"Hangup failed: {exc}") from exc
