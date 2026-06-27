"""Request schemas for call/conference endpoints."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class CallStartRequest(BaseModel):
    phone_number: str
    tenant_id: str


class StartCallRequest(BaseModel):
    phone_number: str
    tenant_id: str


class StartIVRRequest(BaseModel):
    phone_number: str


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
    fsmContextId: str
    data: Any | None = None
    isCompleted: bool


class FsmContextRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    fsmContextId: str
    phoneNumbers: list[str] | None
