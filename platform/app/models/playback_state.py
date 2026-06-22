"""Audio playback state model (from ConferenceV2 audio_content_state.py)."""
from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class ContentStatus(StrEnum):
    STARTING = "Starting"
    PLAYING = "Playing"
    PAUSED = "Paused"
    STOPPED = "Stopped"


class AudioContentState(BaseModel):
    """Tracks the live audio playback state for a conference."""

    model_config = ConfigDict(use_enum_values=True, populate_by_name=True)

    current_url: str | None = None
    status: ContentStatus = Field(default=ContentStatus.STOPPED)
    paused_at: str | None = None
    position_seconds: float | None = Field(default=None, ge=0)
    duration_seconds: float | None = Field(default=None, ge=0)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
