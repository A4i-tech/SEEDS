# models/content_manager.py

from pydantic import BaseModel, Field
from enum import Enum
from typing import Optional
from datetime import datetime


class ContentStatus(str, Enum):
    STARTING = "Starting"
    PLAYING = "Playing"
    PAUSED = "Paused"
    STOPPED = "Stopped"


class AudioContentState(BaseModel):
    current_url: Optional[str] = None
    status: ContentStatus = Field(default=ContentStatus.STOPPED)
    paused_at: Optional[str] = None
    position_seconds: Optional[float] = Field(default=None, ge=0)
    duration_seconds: Optional[float] = Field(default=None, ge=0)
    speed: float = Field(default=1.0, ge=0.5, le=2.0)

    class Config:
        use_enum_values = True  # Automatically use enum values instead of objects for serialization
