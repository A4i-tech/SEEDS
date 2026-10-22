from __future__ import annotations

from enum import StrEnum
from typing import Annotated

from pydantic import AnyUrl, BaseModel, Field, field_validator


class WebhookEventType(StrEnum):
    JOB_COMPLETED = "job.completed"
    JOB_FAILED = "job.failed"
    CONTENT_UPDATED = "content.updated"
    CONTENT_DELETED = "content.deleted"


class WebhookStatus(StrEnum):
    ACTIVE = "active"
    DISABLED = "disabled"


EventList = Annotated[list[WebhookEventType], Field(min_length=1)]


def _require_https(url: AnyUrl) -> AnyUrl:
    if url.scheme != "https":
        raise ValueError("webhook url must use HTTPS")
    return url


class WebhookRegisterRequest(BaseModel):
    url: AnyUrl
    events: EventList

    @field_validator("url")
    @classmethod
    def _check_https(cls, url: AnyUrl) -> AnyUrl:
        return _require_https(url)

    @field_validator("events")
    @classmethod
    def _dedupe(cls, events: list[WebhookEventType]) -> list[WebhookEventType]:
        return list(dict.fromkeys(events))


class WebhookUpdateRequest(BaseModel):
    url: AnyUrl | None = None
    events: EventList | None = None
    status: WebhookStatus | None = None
    rotate_secret: bool = False

    @field_validator("url")
    @classmethod
    def _check_https(cls, url: AnyUrl | None) -> AnyUrl | None:
        return _require_https(url) if url is not None else None

    @field_validator("events")
    @classmethod
    def _dedupe(cls, events: list[WebhookEventType] | None) -> list[WebhookEventType] | None:
        return list(dict.fromkeys(events)) if events is not None else None
