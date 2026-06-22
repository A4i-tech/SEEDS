"""Request schemas for call/conference endpoints."""
from __future__ import annotations

from typing import Any, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class CreateConferenceRequest(BaseModel):
    teacher_phone: str
    teacher_name: Optional[str] = None
    student_phones: List[str]
    student_names: Optional[List[Optional[str]]] = None
    leader_phone: Optional[str] = None


class LogCallRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    type: str
    time: str
    fsm_context_id: str = Field(..., alias="fsmContextId")
    data: Optional[Any] = None
    is_completed: bool = Field(..., alias="isCompleted")


class FsmContextRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    fsm_context_id: str = Field(..., alias="fsmContextId")
    phone_numbers: Optional[List[str]] = Field(None, alias="phoneNumbers")
