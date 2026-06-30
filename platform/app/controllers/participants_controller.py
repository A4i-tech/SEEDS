"""
Participants controller — manage conference participants.

Preserves EXACT URL paths from ConferenceV2:
  PUT /conference/addparticipant/{conference_id}
  PUT /conference/removeparticipant/{conference_id}
  PUT /conference/muteparticipant/{conference_id}
  PUT /conference/unmuteparticipant/{conference_id}
  PUT /conference/muteall/{conference_id}
  PUT /conference/unmuteall/{conference_id}
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.controllers._conference_helpers import get_conf_or_404
from app.platform.auth.dependencies import require_conference_owner

router = APIRouter(prefix="/conference", tags=["Participants"])


@router.put("/addparticipant/{conference_id}", summary="Add participant to conference")
async def add_participant(
    conference_id: str,
    phone_number: str = Query(...),
    name: str | None = Query(None),
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.add_participant_event import AddParticipantEvent  # noqa: PLC0415

    conf = get_conf_or_404(conference_id)
    await conf.queue_event(AddParticipantEvent(phone_number=phone_number, name=name, conf_call=conf))
    return {"message": "Event Queued for execution"}


@router.put("/removeparticipant/{conference_id}", summary="Remove participant from conference")
async def remove_participant(
    conference_id: str,
    phone_number: str = Query(...),
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.remove_participant_event import (
        RemoveParticipantEvent,  # noqa: PLC0415
    )

    conf = get_conf_or_404(conference_id)
    await conf.queue_event(RemoveParticipantEvent(phone_number=phone_number, conf_call=conf))
    return {"message": "Event Queued for execution"}


@router.put("/muteparticipant/{conference_id}", summary="Mute a participant")
async def mute_participant(
    conference_id: str,
    phone_number: str = Query(...),
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.mute_participant_event import MuteParticipantEvent  # noqa: PLC0415

    conf = get_conf_or_404(conference_id)
    await conf.queue_event(MuteParticipantEvent(phone_number=phone_number, conf_call=conf))
    return {"message": "Event Queued for execution"}


@router.put("/unmuteparticipant/{conference_id}", summary="Unmute a participant")
async def unmute_participant(
    conference_id: str,
    phone_number: str = Query(...),
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.unmute_participant_event import (
        UnmuteParticipantEvent,  # noqa: PLC0415
    )

    conf = get_conf_or_404(conference_id)
    await conf.queue_event(UnmuteParticipantEvent(phone_number=phone_number, conf_call=conf))
    return {"message": "Event Queued for execution"}


@router.put("/muteall/{conference_id}", summary="Mute all students in conference")
async def mute_all(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.mute_all_event import MuteAllEvent  # noqa: PLC0415

    conf = get_conf_or_404(conference_id)
    teacher = conf.state.get_teacher()
    if not teacher:
        raise HTTPException(status_code=403, detail="Only teachers can mute all participants")
    await conf.queue_event(MuteAllEvent(conf_call=conf))
    return {"message": "Event Queued for execution"}


@router.put("/unmuteall/{conference_id}", summary="Unmute all students in conference")
async def unmute_all(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.unmute_all_event import UnmuteAllEvent  # noqa: PLC0415

    conf = get_conf_or_404(conference_id)
    teacher = conf.state.get_teacher()
    if not teacher:
        raise HTTPException(status_code=403, detail="Only teachers can unmute all participants")
    await conf.queue_event(UnmuteAllEvent(conf_call=conf))
    return {"message": "Event Queued for execution"}
