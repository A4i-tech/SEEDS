"""Webhook event model (from ConferenceV2 webhook_event.py)."""
from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict


class EventType(StrEnum):
    PARTICIPANT_STATUS = "participant_status"
    DTMF_INPUT = "dtmf_input"
    AUDIO_PLAYBACK = "audio_playback"
    MUTE_UNMUTE = "mute_unmute"


class WebHookEvent(BaseModel):
    """Internal event passed between webhook handler and state machine."""

    model_config = ConfigDict(use_enum_values=True, populate_by_name=True)

    conference_id: str
    event_type: EventType
    participant_phone: str | None = None
    data: dict[str, Any]
