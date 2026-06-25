"""Request schemas for call/conference endpoints."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CreateConferenceRequest(BaseModel):
    teacher_phone: str
    teacher_name: str | None = None
    student_phones: list[str]
    student_names: list[str | None] | None = None
    leader_phone: str | None = None


class LogCallRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: str
    time: str
    fsm_context_id: str
    data: Any | None = None
    is_completed: bool


class FsmContextRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    fsm_context_id: str
    phone_numbers: list[str] | None = None
