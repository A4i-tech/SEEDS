"""Shared simple response DTOs — snake_case wire format."""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class MessageResponse(BaseModel):
    message: str


class EventQueuedResponse(BaseModel):
    message: str = "Event Queued for execution"


class DeleteMatchedResponse(BaseModel):
    matched: int


class TokenResponse(BaseModel):
    token: str


class SasUrlResponse(BaseModel):
    url: str


class SasTokenResponse(BaseModel):
    sas_token: str


class JobScheduledResponse(BaseModel):
    message: str
    job_id: str


class JobStatusResponse(BaseModel):
    job_id: str
    status: str
    content_id: str | None = None


class ConferenceStatusResponse(BaseModel):
    status: str
    id: str


class ThemeResponse(BaseModel):
    name: str
    audio_url: str


class LoginResponse(BaseModel):
    token: str
    user: dict[str, Any]


class TeacherTransferResponse(BaseModel):
    message: str
    teacher: dict[str, Any]
