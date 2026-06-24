"""Request schemas for call/conference endpoints."""
from __future__ import annotations

from typing import Any

from app.models.base import BaseDocument


class CreateConferenceRequest(BaseDocument):
    teacher_phone: str      # alias: teacherPhone
    teacher_name: str | None = None
    student_phones: list[str]   # alias: studentPhones
    student_names: list[str | None] | None = None
    leader_phone: str | None = None  # alias: leaderPhone


class LogCallRequest(BaseDocument):
    type: str
    time: str
    fsm_context_id: str     # alias: fsmContextId
    data: Any | None = None
    is_completed: bool      # alias: isCompleted


class FsmContextRequest(BaseDocument):
    fsm_context_id: str     # alias: fsmContextId
    phone_numbers: list[str] | None = None  # alias: phoneNumbers
