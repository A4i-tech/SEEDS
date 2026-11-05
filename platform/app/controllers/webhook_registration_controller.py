from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, Depends, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import WebhookEventType
from app.models.requests.webhook_registration_requests import (
    WebhookRegisterRequest,
    WebhookUpdateRequest,
)
from app.models.responses.webhook_registration import (
    WebhookListResponse,
    WebhookResponse,
    WebhookWithSecretResponse,
)
from app.platform.auth.dependencies import get_db, require_aggregator_client
from app.platform.error_handling import AppError, NotFoundError
from app.platform.security import limiter
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from app.services.content_aggregator import _jwt
from app.services.webhook_registration_service import (
    WebhookRegistrationService,
    get_webhook_registration_service,
)

_FIELD_ERROR_CODES = {
    "url": ("URL_NOT_HTTPS", "webhook url must use HTTPS"),
    "events": ("INVALID_EVENT_TYPE", "unsupported or empty event list"),
    "status": ("INVALID_STATUS", "status must be 'active' or 'disabled'"),
}


def _spec_error(exc: RequestValidationError) -> AppError:
    for err in exc.errors():
        loc = err["loc"]
        if loc[0] != "body" or loc[1] not in _FIELD_ERROR_CODES:
            continue
        if loc[1] == "url" and err["type"] != "value_error":
            continue
        code, message = _FIELD_ERROR_CODES[loc[1]]
        details = None
        if loc[1] == "events":
            supported = [e.value for e in WebhookEventType]
            details = {"unsupported": [err["input"]], "supported": supported}
        return AppError(code, message, 400, details)
    first = exc.errors()[0]
    field = ".".join(str(part) for part in first["loc"])
    return AppError("VALIDATION_ERROR", f"{field}: {first['msg']}", 400)


class _SpecErrorRoute(APIRoute):
    def get_route_handler(self) -> Callable[[Request], Coroutine[Any, Any, Response]]:
        handler = super().get_route_handler()

        async def wrapped(request: Request) -> Response:
            try:
                return await handler(request)
            except RequestValidationError as exc:
                raise _spec_error(exc) from exc

        return wrapped


router = APIRouter(prefix="/v1/webhooks", tags=["Webhooks"], route_class=_SpecErrorRoute)


def _parse_webhook_id(webhook_id: str) -> ObjectId:
    try:
        return ObjectId(webhook_id)
    except InvalidId as exc:
        raise NotFoundError("Webhook", webhook_id) from exc


@router.post("", status_code=201, summary="Register a webhook")
@limiter.limit("100/minute")
async def register_webhook(
    request: Request,
    body: WebhookRegisterRequest,
    claims: _jwt.AccessTokenClaims = Depends(require_aggregator_client),
    service: WebhookRegistrationService = Depends(get_webhook_registration_service),
) -> WebhookWithSecretResponse:
    webhook, secret = await service.register(claims.sub, claims.scopes, body)
    return WebhookWithSecretResponse.of_new(webhook, secret)


@router.get("", summary="List own webhooks")
@limiter.limit("300/minute")
async def list_webhooks(
    request: Request,
    claims: _jwt.AccessTokenClaims = Depends(require_aggregator_client),
    db: AsyncDatabase = Depends(get_db),
) -> WebhookListResponse:
    webhooks = await ContentAggregatorWebhookRepository(db).list_for_client(claims.sub)
    return WebhookListResponse(webhooks=[WebhookResponse.of(w) for w in webhooks])


@router.patch("/{webhook_id}", summary="Update a webhook")
@limiter.limit("100/minute")
async def update_webhook(
    request: Request,
    webhook_id: str,
    body: WebhookUpdateRequest,
    claims: _jwt.AccessTokenClaims = Depends(require_aggregator_client),
    service: WebhookRegistrationService = Depends(get_webhook_registration_service),
) -> WebhookResponse | WebhookWithSecretResponse:
    webhook, secret = await service.update(
        claims.sub, _parse_webhook_id(webhook_id), claims.scopes, body
    )
    if secret is None:
        return WebhookResponse.of(webhook)
    return WebhookWithSecretResponse.of_new(webhook, secret)


@router.delete("/{webhook_id}", status_code=204, summary="Remove a webhook")
@limiter.limit("100/minute")
async def delete_webhook(
    request: Request,
    webhook_id: str,
    claims: _jwt.AccessTokenClaims = Depends(require_aggregator_client),
    service: WebhookRegistrationService = Depends(get_webhook_registration_service),
) -> None:
    await service.delete(claims.sub, _parse_webhook_id(webhook_id))
