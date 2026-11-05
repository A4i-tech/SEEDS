from __future__ import annotations

from typing import Annotated

from pydantic import AfterValidator, AnyUrl, BaseModel, Field

from app.models.content_aggregator import WebhookEventType, WebhookStatus
from app.platform.settings import get_settings


def _require_https(url: AnyUrl) -> AnyUrl:
    if url.scheme != "https" and get_settings().require_https_webhooks:
        raise ValueError("webhook url must use HTTPS")
    return url


def _dedupe(events: list[WebhookEventType]) -> list[WebhookEventType]:
    return list(dict.fromkeys(events))


HttpsUrl = Annotated[AnyUrl, AfterValidator(lambda url: _require_https(url))]
EventList = Annotated[list[WebhookEventType], AfterValidator(_dedupe), Field(min_length=1)]


class WebhookRegisterRequest(BaseModel):
    url: HttpsUrl
    events: EventList


class WebhookUpdateRequest(BaseModel):
    url: HttpsUrl | None = None
    events: EventList | None = None
    status: WebhookStatus | None = None
    rotate_secret: bool = False
