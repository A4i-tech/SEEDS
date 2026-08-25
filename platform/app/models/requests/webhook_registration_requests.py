"""Request schemas for content aggregator webhook registration endpoints."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel


class WebhookEventType(StrEnum):
    JOB_COMPLETED = "job.completed"
    JOB_FAILED = "job.failed"
    CONTENT_UPDATED = "content.updated"
    CONTENT_DELETED = "content.deleted"


class WebhookRegisterRequest(BaseModel):
    url: str
    events: list[str]


class WebhookUpdateRequest(BaseModel):
    url: str | None = None
    events: list[str] | None = None
    status: str | None = None
    rotate_secret: bool = False
