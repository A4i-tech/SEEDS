"""Conference management routes — /conference/*."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends

from app.controllers._conference_helpers import get_conf_or_404
from app.models.requests.call_requests import CreateConferenceRequest
from app.models.responses.common import ConferenceStatusResponse, EventQueuedResponse
from app.platform.auth.dependencies import (
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



async def _create_conf(request: CreateConferenceRequest) -> Any:
    return await get_conference_manager().create_conference(
        request.teacher_phone,
        request.student_phones,
        request.leader_phone,
        teacher_name=request.teacher_name,
        student_names=request.student_names,
    )


@router.post("/create", summary="Create a conference call", status_code=201)
async def create_conference(
    request: CreateConferenceRequest,
    user: dict[str, Any] = Depends(require_role("teacher", "content_creator")),
    service: ConferenceOwnershipService = Depends(get_conference_ownership_service),
) -> ConferenceStatusResponse:
    conf = await _create_conf(request)
    await service.record_ownership(
        conf_id=conf.conf_id,
        created_by=user.get("sub", ""),
        tenant_id=user.get("tenant_id", ""),
        teacher_phone=request.teacher_phone,
    )
    return ConferenceStatusResponse(status="CREATED", id=conf.conf_id)


@router.post("/start/{conference_id}", summary="Start a conference call")
async def start_conference(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> ConferenceStatusResponse:
    await get_conference_manager().start_conference_call(conference_id)
    return ConferenceStatusResponse(status="STARTED", id=conference_id)


@router.get("/teacherappconnect/{conference_id}", summary="Connect teacher smartphone")
async def connect_smartphone(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    return await get_conf_or_404(conference_id).connect_smartphone()


@router.post("/teacherappdisconnect/{conference_id}", summary="Disconnect teacher smartphone")
async def disconnect_smartphone(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    return await get_conf_or_404(conference_id).disconnect_smartphone()


@router.put("/end/{conference_id}", summary="End a conference call")
async def end_conference(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> EventQueuedResponse:
    from app.services.confevents.end_conf_event import EndConferenceEvent  # noqa: PLC0415

    conf = get_conf_or_404(conference_id)
    await conf.queue_event(EndConferenceEvent(conf_call=conf))
    return EventQueuedResponse(message="Event Queued for execution")


@router.put("/sink/{conference_id}", summary="Sink (clean up) a conference call")
async def sink_conference(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> EventQueuedResponse:
    from app.services.confevents.sink_conf_event import SinkConferenceEvent  # noqa: PLC0415

    mgr = get_conference_manager()
    conf = get_conf_or_404(conference_id)
    if not conf.is_queue_processing():
        conf.start_processing_conf_events_from_queue()
    await conf.queue_event(
        SinkConferenceEvent(
            conf_call=conf,
            on_sink_callback=lambda: mgr.delete_conference(conference_id),
        )
    )
    return EventQueuedResponse(message="Event Queued for execution")
