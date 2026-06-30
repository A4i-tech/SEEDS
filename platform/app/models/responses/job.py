"""Request schemas for student and teacher CRUD endpoints — snake_case only."""

from __future__ import annotations

from pydantic import BaseModel


class JobScheduledResponse(BaseModel):
    message: str
    jobId: str


class JobStatusResponse(BaseModel):
    jobId: str | None = None
    status: str | None = "UNKNOWN"
    contentId: str | None
    startedAt: str | None
    reason: str | None


class SasUrlResponse(BaseModel):
    url: str | None = None


class SasTokenResponse(BaseModel):
    sasToken: str | None = None


class DeleteMatchedResponse(BaseModel):
    matched: int


class ThemeResponse(BaseModel):
    name: str | None
    audioUrl: str | None = ""
