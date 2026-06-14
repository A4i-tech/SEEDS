"""Audio playback state model (from ConferenceV2 audio_content_state.py)."""
from __future__ import annotations

from enum import Enum
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class ContentStatus(str, Enum):
    STARTING = "Starting"
    PLAYING = "Playing"
    PAUSED = "Paused"
    STOPPED = "Stopped"


class AudioContentState(BaseModel):
    """Tracks the live audio playback state for a conference."""

    model_config = ConfigDict(use_enum_values=True, populate_by_name=True)

    current_url: Optional[str] = None
    status: ContentStatus = Field(default=ContentStatus.STOPPED)
    paused_at: Optional[str] = None
    position_seconds: Optional[float] = Field(default=None, ge=0)
    duration_seconds: Optional[float] = Field(default=None, ge=0)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)
