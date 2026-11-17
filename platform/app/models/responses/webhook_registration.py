from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.content_aggregator import Webhook, WebhookEventType, WebhookStatus


class WebhookResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    url: str
    events: list[WebhookEventType]
    status: WebhookStatus
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, webhook: Webhook) -> WebhookResponse:
        return cls.model_validate(webhook)


class WebhookWithSecretResponse(WebhookResponse):
    secret: str = ""

    @classmethod
    def of_new(cls, webhook: Webhook, secret: str) -> WebhookWithSecretResponse:
        response = cls.model_validate(webhook)
        response.secret = secret
        return response


class WebhookListResponse(BaseModel):
    webhooks: list[WebhookResponse]
