"""Webhook registration controller — /v1/webhooks/* endpoints letting
tenant-scoped users register callback URLs for content aggregator
job/content events.

NOTE: Spec §6.9 defines 403 SCOPE_INSUFFICIENT (per-event `allowed_scopes`
check) which requires the client-credential/allowed_scopes system from
PLAT-2 (§2.2 client registration). #463 explicitly depends on PLAT-2 and
that system does not exist in this codebase yet, so scope enforcement is
not implemented here. Auth is role-gated (tenant/school_admin/content_creator)
via the same interim pattern used by content_aggregator_controller.py.
"""
from __future__ import annotations

import logging
import secrets
from typing import Any

from fastapi import APIRouter, Depends

from app.models.requests.webhook_registration_requests import (
    WebhookEventType,
    WebhookRegisterRequest,
    WebhookUpdateRequest,
)
from app.models.user import UserRole
from app.platform.auth.dependencies import require_role
from app.platform.auth.hashing import hash_password
from app.platform.error_handling import AppError, NotFoundError
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
    get_content_aggregator_webhook_repo,
)

router = APIRouter(prefix="/v1/webhooks", tags=["Webhooks"])
logger = logging.getLogger(__name__)

MAX_WEBHOOKS_PER_CLIENT = 5
_VALID_EVENT_TYPES = frozenset(e.value for e in WebhookEventType)

_require_webhook_access = require_role(
    UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value
)


def _validate_events(events: list[str]) -> None:
    unsupported = [e for e in events if e not in _VALID_EVENT_TYPES]
    if unsupported:
        raise AppError(
            "INVALID_EVENT_TYPE",
            "unsupported event type(s)",
            400,
            {"unsupported": unsupported},
        )


def _validate_url(url: str) -> None:
    if not url.startswith("https://"):
        raise AppError("URL_NOT_HTTPS", "webhook url must use HTTPS", 400)


def _validate_status(status: str) -> None:
    if status not in ("active", "disabled"):
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
    user: dict[str, Any] = Depends(_require_webhook_access),
    repo: ContentAggregatorWebhookRepository = Depends(get_content_aggregator_webhook_repo),
) -> dict[str, Any]:
    tenant_id = user.get("tenant_id", "")
    _validate_url(body.url)
    _validate_events(body.events)
    if await repo.count_for_tenant(tenant_id) >= MAX_WEBHOOKS_PER_CLIENT:
        raise AppError("WEBHOOK_LIMIT_REACHED", "maximum webhooks per client reached", 409)
    secret = secrets.token_hex(32)
    doc = await repo.create(tenant_id, body.url, hash_password(secret), body.events)
    logger.info("webhook registered webhookId=%s tenantId=%s", doc["_id"], tenant_id)
    return _serialize(doc) | {"secret": secret}


@router.get("", summary="List own webhooks")
async def list_webhooks(
    user: dict[str, Any] = Depends(_require_webhook_access),
    repo: ContentAggregatorWebhookRepository = Depends(get_content_aggregator_webhook_repo),
) -> dict[str, Any]:
    docs = await repo.list_for_tenant(user.get("tenant_id", ""))
    return {"webhooks": [_serialize(d) for d in docs]}


@router.patch("/{webhook_id}", summary="Update a webhook")
async def update_webhook(
    webhook_id: str,
    body: WebhookUpdateRequest,
    user: dict[str, Any] = Depends(_require_webhook_access),
    repo: ContentAggregatorWebhookRepository = Depends(get_content_aggregator_webhook_repo),
) -> dict[str, Any]:
    tenant_id = user.get("tenant_id", "")
    if body.url is not None:
        _validate_url(body.url)
    if body.events is not None:
        _validate_events(body.events)
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
        fields["secret_hash"] = hash_password(new_secret)

    if not fields:
        doc = await repo.get_for_tenant(tenant_id, webhook_id)
    else:
        doc = await repo.update_for_tenant(tenant_id, webhook_id, fields)
    if doc is None:
        raise NotFoundError("Webhook", webhook_id)

    logger.info("webhook updated webhookId=%s tenantId=%s", webhook_id, tenant_id)
    result = _serialize(doc)
    if new_secret is not None:
        result["secret"] = new_secret
    return result


@router.delete("/{webhook_id}", status_code=204, summary="Remove a webhook")
async def delete_webhook(
    webhook_id: str,
    user: dict[str, Any] = Depends(_require_webhook_access),
    repo: ContentAggregatorWebhookRepository = Depends(get_content_aggregator_webhook_repo),
) -> None:
    tenant_id = user.get("tenant_id", "")
    deleted = await repo.delete_for_tenant(tenant_id, webhook_id)
    if not deleted:
        raise NotFoundError("Webhook", webhook_id)
    logger.info("webhook deleted webhookId=%s tenantId=%s", webhook_id, tenant_id)
