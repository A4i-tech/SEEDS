from __future__ import annotations

import logging
import secrets

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import Webhook
from app.models.requests.webhook_registration_requests import (
    WebhookEventType,
    WebhookRegisterRequest,
    WebhookUpdateRequest,
)
from app.platform.auth.dependencies import get_db
from app.platform.auth.webhook_secret import encrypt_secret
from app.platform.error_handling import AppError, NotFoundError
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)

logger = logging.getLogger(__name__)

MAX_WEBHOOKS_PER_CLIENT = 5

_EVENT_REQUIRED_SCOPE = {
    WebhookEventType.JOB_COMPLETED: "content:write",
    WebhookEventType.JOB_FAILED: "content:write",
    WebhookEventType.CONTENT_UPDATED: "content:read",
    WebhookEventType.CONTENT_DELETED: "content:read",
}


def _new_secret() -> tuple[str, str]:
    secret = secrets.token_hex(32)
    return secret, encrypt_secret(secret)


class WebhookRegistrationService:
    def __init__(self, webhook_repo: ContentAggregatorWebhookRepository) -> None:
        self._repo = webhook_repo

    @staticmethod
    def _require_scope(events: list[WebhookEventType], granted_scope: str) -> None:
        required = {_EVENT_REQUIRED_SCOPE[e] for e in events}
        if not required.issubset(granted_scope.split()):
            raise AppError("SCOPE_INSUFFICIENT", "requested events exceed granted scope", 403)

    async def register(
        self, client_id: str, granted_scope: str, body: WebhookRegisterRequest
    ) -> tuple[Webhook, str]:
        self._require_scope(body.events, granted_scope)
        secret, encrypted = _new_secret()
        webhook = await self._repo.create(
            client_id, str(body.url), encrypted, body.events, limit=MAX_WEBHOOKS_PER_CLIENT
        )
        if webhook is None:
            raise AppError("WEBHOOK_LIMIT_REACHED", "maximum webhooks per client reached", 409)
        logger.info(
            "register_webhook: webhook registered webhookId=%s clientId=%s",
            webhook.id, client_id,
        )
        return webhook, secret

    async def list_for_client(self, client_id: str) -> list[Webhook]:
        return await self._repo.list_for_client(client_id)

    async def update(
        self, client_id: str, webhook_id: str, granted_scope: str, body: WebhookUpdateRequest
    ) -> tuple[Webhook, str | None]:
        if body.events is not None:
            self._require_scope(body.events, granted_scope)
        secret: str | None = None
        encrypted: str | None = None
        if body.rotate_secret:
            secret, encrypted = _new_secret()

        updates = body.model_dump(mode="json", exclude_none=True, exclude={"rotate_secret"})
        webhook = await self._repo.update_for_client(
            client_id, webhook_id, updates=updates, secret_encrypted=encrypted
        )
        if webhook is None:
            raise NotFoundError("Webhook", webhook_id)
        logger.info(
            "update_webhook: webhook updated webhookId=%s clientId=%s rotated=%s",
            webhook_id, client_id, body.rotate_secret,
        )
        return webhook, secret

    async def delete(self, client_id: str, webhook_id: str) -> None:
        if not await self._repo.delete_for_client(client_id, webhook_id):
            raise NotFoundError("Webhook", webhook_id)
        logger.info(
            "delete_webhook: webhook deleted webhookId=%s clientId=%s",
            webhook_id, client_id,
        )


def get_webhook_registration_service(
    db: AsyncDatabase = Depends(get_db),
) -> WebhookRegistrationService:
    return WebhookRegistrationService(ContentAggregatorWebhookRepository(db))
