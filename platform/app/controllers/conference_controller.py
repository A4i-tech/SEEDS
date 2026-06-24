"""Conference management routes — /conference/*."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException

from app.models.requests.call_requests import CreateConferenceRequest
from app.platform.auth.dependencies import (
    get_current_user,
    require_conference_owner,
    require_role,
)
from app.platform.lifespan import get_conference_manager
from app.services.conference_service import (
    ConferenceOwnershipService,
    get_conference_ownership_service,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/conference", tags=["Conference"])


def _get_conf_or_404(conference_id: str) -> Any:
    conf = get_conference_manager().get_conference(conference_id)
    if conf is None:
        raise HTTPException(status_code=404, detail="Conference not found")
    return conf


async def _create_conf(request: CreateConferenceRequest) -> Any:
    return await get_conference_manager().create_conference(
        request.teacher_phone,
        request.student_phones,
        request.leader_phone,
        teacher_name=request.teacher_name,
        student_names=request.student_names,
    )


@router.post("/test-createstart", summary="Create and immediately start a conference (test)")
async def create_start_conference(request: CreateConferenceRequest) -> Any:
    conf = await _create_conf(request)
    await conf.start_conference_call()
    return {"status": "STARTED", "id": conf.conf_id}


_require_conference_create = require_role("teacher", "content_creator")


@router.post("/create", summary="Create a conference call", status_code=201)
async def create_conference(
    request: CreateConferenceRequest,
    user: dict[str, Any] = Depends(_require_conference_create),
    service: ConferenceOwnershipService = Depends(get_conference_ownership_service),
) -> Any:
    conf = await _create_conf(request)
    await service.record_ownership(
        conf_id=conf.conf_id,
        created_by=user.get("sub", ""),
        tenant_id=user.get("tenant_id", ""),
        teacher_phone=request.teacher_phone,
    )
    return {"status": "CREATED", "id": conf.conf_id}


@router.post("/start/{conference_id}", summary="Start a conference call")
async def start_conference(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    await get_conference_manager().start_conference_call(conference_id)
    return {"status": "STARTED", "id": conference_id}


@router.get("/teacherappconnect/{conference_id}", summary="Connect teacher smartphone (SSE stream)")
async def connect_smartphone(
    conference_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    return await _get_conf_or_404(conference_id).connect_smartphone()


@router.post("/teacherappdisconnect/{conference_id}", summary="Disconnect teacher smartphone")
async def disconnect_smartphone(
    conference_id: str,
    user: dict[str, Any] = Depends(get_current_user),
) -> Any:
    return await _get_conf_or_404(conference_id).disconnect_smartphone()


@router.put("/end/{conference_id}", summary="End a conference call")
async def end_conference(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.end_conf_event import EndConferenceEvent  # noqa: PLC0415

    conf = _get_conf_or_404(conference_id)
    await conf.queue_event(EndConferenceEvent(conf_call=conf))
    return {"message": "Event Queued for execution"}


@router.put("/sink/{conference_id}", summary="Sink (clean up) a conference call")
async def sink_conference(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.sink_conf_event import SinkConferenceEvent  # noqa: PLC0415

    mgr = get_conference_manager()
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
