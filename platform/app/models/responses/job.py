"""Request schemas for student and teacher CRUD endpoints — snake_case only."""

from __future__ import annotations

from pydantic import BaseModel


class JobScheduledResponse(BaseModel):
    message: str
    job_id: str


class JobStatusResponse(BaseModel):
    job_id: str | None = None
    status: str | None = "UNKNOWN"
    content_id: str | None
    started_at: str | None
    reason: str | None


class JobListResponse(BaseModel):
    jobs: list[JobStatusResponse]


class SasUrlResponse(BaseModel):
    url: str | None = None


class SasTokenResponse(BaseModel):
    sas_token: str | None = None


class DeleteMatchedResponse(BaseModel):
    matched: int


class ThemeResponse(BaseModel):
    name: str | None
    audio_url: str | None = ""
