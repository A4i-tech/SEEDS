"""Participant domain model (from ConferenceV2 participant.py)."""
from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, ConfigDict, Field


class Role(str, Enum):
    TEACHER = "Teacher"
    STUDENT = "Student"


class CallStatus(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    ON_HOLD = "on_hold"


class Participant(BaseModel):
    """A single conference participant."""

    model_config = ConfigDict(use_enum_values=True, populate_by_name=True)

    name: str
    phone_number: str
    role: Role
    added_after_start: bool = Field(default=False)
    raised_at: int = Field(default=-1)
    is_raised: bool = Field(default=False)
    is_muted: bool = Field(default=False)
    call_status: CallStatus = Field(default=CallStatus.DISCONNECTED)
