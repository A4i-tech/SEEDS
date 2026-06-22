"""
Playback controller — audio playback control for conference calls.

Preserves EXACT URL paths from ConferenceV2:
  PUT /conference/playaudio/{conference_id}
  PUT /conference/pauseaudio/{conference_id}
  PUT /conference/resumeaudio/{conference_id}
  PUT /conference/seekaudio/{conference_id}
  PUT /conference/setplaybackspeed/{conference_id}
"""

from __future__ import annotations

from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query

from app.platform.auth.dependencies import require_conference_owner

router = APIRouter(prefix="/conference", tags=["Playback"])


def _validate_audio_url(url: str) -> None:
    """Reject plaintext HTTP audio URLs forwarded to Vonage NCCO."""
    try:
        parsed = urlparse(url)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid audio URL")

    if parsed.scheme != "https":
        raise HTTPException(status_code=400, detail="Audio URL must use HTTPS")


def _get_conference_manager() -> Any:
    from app.platform.lifespan import get_conference_manager  # noqa: PLC0415
    return get_conference_manager()


def _get_conf_or_404(conference_id: str) -> Any:
    mgr = _get_conference_manager()
    conf = mgr.get_conference(conference_id)
    if conf is None:
        raise HTTPException(status_code=404, detail="Conference not found")
    return conf


@router.put("/playaudio/{conference_id}", summary="Play audio content in conference")
async def play_audio(
    conference_id: str,
    url: str = Query(..., description="Azure Blob URL of the audio content"),
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.play_content_event import PlayContentEvent  # noqa: PLC0415

    _validate_audio_url(url)
    conf = _get_conf_or_404(conference_id)
    await conf.queue_event(PlayContentEvent(conf_call=conf, url=url))
    return {"message": "Event Queued for execution"}


@router.put("/pauseaudio/{conference_id}", summary="Pause audio content")
async def pause_audio(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.pause_content_event import PauseContentEvent  # noqa: PLC0415

    conf = _get_conf_or_404(conference_id)
    await conf.queue_event(PauseContentEvent(conf_call=conf))
    return {"message": "Event Queued for execution"}


@router.put("/resumeaudio/{conference_id}", summary="Resume audio content")
async def resume_audio(
    conference_id: str,
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.resume_content_event import ResumeContentEvent  # noqa: PLC0415

    conf = _get_conf_or_404(conference_id)
    await conf.queue_event(ResumeContentEvent(conf_call=conf))
    return {"message": "Event Queued for execution"}


@router.put("/seekaudio/{conference_id}", summary="Seek audio position")
async def seek_audio(
    conference_id: str,
    delta_seconds: int | None = Query(None, description="Signed seek offset in seconds"),
    position_seconds: float | None = Query(None, description="Absolute position in seconds"),
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.seek_content_event import SeekContentEvent  # noqa: PLC0415

    if (delta_seconds is None) == (position_seconds is None):
        raise HTTPException(
            status_code=400,
            detail="Exactly one of delta_seconds or position_seconds must be provided",
        )
    conf = _get_conf_or_404(conference_id)
    await conf.queue_event(SeekContentEvent(conf_call=conf, delta_seconds=delta_seconds, position_seconds=position_seconds))
    return {"message": "Event Queued for execution"}


@router.put("/setplaybackspeed/{conference_id}", summary="Set playback speed")
async def set_playback_speed(
    conference_id: str,
    speed: float = Query(..., ge=0.5, le=2.0, description="Playback speed multiplier"),
    user: dict[str, Any] = Depends(require_conference_owner),
) -> Any:
    from app.services.confevents.set_playback_speed_event import (
        SetPlaybackSpeedEvent,  # noqa: PLC0415
    )

    conf = _get_conf_or_404(conference_id)
    await conf.queue_event(SetPlaybackSpeedEvent(conf_call=conf, speed=speed))
    return {"message": "Event Queued for execution"}
