from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.content_aggregator import Webhook
from app.models.requests.webhook_registration_requests import WebhookEventType, WebhookStatus


class WebhookResponse(BaseModel):
    webhookId: str
    url: str
    events: list[WebhookEventType]
    status: WebhookStatus
    created_at: datetime
    updated_at: datetime

    @classmethod
    def of(cls, webhook: Webhook) -> WebhookResponse:
        return cls(
            webhookId=webhook.id,
            url=webhook.url,
            events=webhook.events,
            status=webhook.status,
            created_at=webhook.created_at,
            updated_at=webhook.updated_at,
        )


class WebhookWithSecretResponse(WebhookResponse):
    secret: str

    @classmethod
    def of_new(cls, webhook: Webhook, secret: str) -> WebhookWithSecretResponse:
        return cls(**WebhookResponse.of(webhook).model_dump(), secret=secret)


class WebhookListResponse(BaseModel):
    webhooks: list[WebhookResponse]
