from __future__ import annotations

import logging
import secrets
from typing import Any
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordBearer

from app.controllers.content_aggregator_auth_controller import get_content_aggregator_auth
from app.models.requests.webhook_registration_requests import (
    WebhookEventType,
    WebhookRegisterRequest,
    WebhookUpdateRequest,
)
from app.platform.auth.hashing import hash_password
from app.platform.error_handling import AppError, NotFoundError, UnauthorizedError
from app.platform.logging import user_id_ctx_var
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
    get_content_aggregator_webhook_repo,
)
from app.services.content_aggregator import _jwt
from app.services.content_aggregator.auth import ContentAggregatorAuth

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/v1/webhooks", tags=["Webhooks"])

MAX_WEBHOOKS_PER_CLIENT = 5
_VALID_EVENT_TYPES = frozenset(e.value for e in WebhookEventType)
_VALID_STATUSES = frozenset({"active", "disabled"})
_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token", auto_error=False)


async def _require_aggregator_client(
    token: str | None = Depends(_oauth2_scheme),
    auth: ContentAggregatorAuth = Depends(get_content_aggregator_auth),
) -> _jwt.AccessTokenClaims:
    if not token:
        raise UnauthorizedError("Missing authentication token")
    claims = await auth.verify_token(token)
    user_id_ctx_var.set(claims["sub"])
    return claims


def _validate_events(events: list[str]) -> None:
    unsupported = [e for e in events if e not in _VALID_EVENT_TYPES]
    if unsupported:
        raise AppError("INVALID_EVENT_TYPE", f"unsupported event type(s): {unsupported}", 400)


def _granted_scopes(claims: _jwt.AccessTokenClaims) -> list[str]:
    scope = claims.get("scope")
    if not isinstance(scope, str):
        raise AppError("SCOPE_INSUFFICIENT", "scope claim missing or malformed", 403)
    return scope.split()


def _validate_scope(events: list[str], granted_scopes: list[str]) -> None:
    if not set(events).issubset(granted_scopes):
        raise AppError("SCOPE_INSUFFICIENT", "requested events exceed granted scope", 403)


def _validate_url(url: str) -> None:
    parsed = urlsplit(url.strip())
    if parsed.scheme.lower() != "https" or not parsed.netloc:
        raise AppError("URL_NOT_HTTPS", "webhook url must use HTTPS", 400)


def _validate_status(status: str) -> None:
    if status not in _VALID_STATUSES:
        raise AppError("INVALID_STATUS", "status must be 'active' or 'disabled'", 400)


def _serialize(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "webhookId": str(doc["_id"]),
        "url": doc["url"],
        "events": doc["events"],
        "status": doc["status"],
        "created_at": doc["created_at"],
        "updated_at": doc["updated_at"],
    }


@router.post("", status_code=201, summary="Register a webhook")
async def register_webhook(
    body: WebhookRegisterRequest,
    claims: _jwt.AccessTokenClaims = Depends(_require_aggregator_client),
    repo: ContentAggregatorWebhookRepository = Depends(get_content_aggregator_webhook_repo),
) -> dict[str, Any]:
    client_id = claims["sub"]
    _validate_url(body.url)
    _validate_events(body.events)
    _validate_scope(body.events, _granted_scopes(claims))
    if await repo.count_for_client(client_id) >= MAX_WEBHOOKS_PER_CLIENT:
        raise AppError("WEBHOOK_LIMIT_REACHED", "maximum webhooks per client reached", 409)
    secret = secrets.token_hex(32)
    doc = await repo.create(client_id, body.url, hash_password(secret), body.events)
    logger.info("register_webhook: webhook registered webhookId=%s clientId=%s", doc["_id"], client_id)
    result = _serialize(doc)
    result["secret"] = secret
    return result


@router.get("", summary="List own webhooks")
async def list_webhooks(
    claims: _jwt.AccessTokenClaims = Depends(_require_aggregator_client),
    repo: ContentAggregatorWebhookRepository = Depends(get_content_aggregator_webhook_repo),
) -> dict[str, Any]:
    docs = await repo.list_for_client(claims["sub"])
    return {"webhooks": [_serialize(d) for d in docs]}


@router.patch("/{webhook_id}", summary="Update a webhook")
async def update_webhook(
    webhook_id: str,
    body: WebhookUpdateRequest,
    claims: _jwt.AccessTokenClaims = Depends(_require_aggregator_client),
    repo: ContentAggregatorWebhookRepository = Depends(get_content_aggregator_webhook_repo),
) -> dict[str, Any]:
    client_id = claims["sub"]
    if body.url is not None:
        _validate_url(body.url)
    if body.events is not None:
        _validate_events(body.events)
        _validate_scope(body.events, _granted_scopes(claims))
    if body.status is not None:
        _validate_status(body.status)

    fields: dict[str, Any] = {}
    if body.url is not None:
        fields["url"] = body.url
    if body.events is not None:
        fields["events"] = body.events
    if body.status is not None:
        fields["status"] = body.status
    new_secret: str | None = None
    if body.rotate_secret:
        new_secret = secrets.token_hex(32)
        fields[ContentAggregatorWebhookRepository.SECRET_HASH_FIELD] = hash_password(new_secret)

    doc = await repo.update_for_client(client_id, webhook_id, fields)
    if doc is None:
        raise NotFoundError("Webhook", webhook_id)
    logger.info("update_webhook: webhook updated webhookId=%s clientId=%s", webhook_id, client_id)
    result = _serialize(doc)
    if new_secret is not None:
        result["secret"] = new_secret
    return result


@router.delete("/{webhook_id}", status_code=204, summary="Remove a webhook")
async def delete_webhook(
    webhook_id: str,
    claims: _jwt.AccessTokenClaims = Depends(_require_aggregator_client),
    repo: ContentAggregatorWebhookRepository = Depends(get_content_aggregator_webhook_repo),
) -> None:
    deleted = await repo.delete_for_client(claims["sub"], webhook_id)
    if not deleted:
        raise NotFoundError("Webhook", webhook_id)
    logger.info("delete_webhook: webhook deleted webhookId=%s clientId=%s", webhook_id, claims["sub"])
