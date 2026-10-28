from __future__ import annotations

from collections.abc import Callable, Coroutine
from typing import Any

from fastapi import APIRouter, Depends, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.routing import APIRoute
from fastapi.security import OAuth2PasswordBearer

from app.models.requests.webhook_registration_requests import (
    WebhookEventType,
    WebhookRegisterRequest,
    WebhookUpdateRequest,
)
from app.models.responses.webhook_registration import (
    WebhookListResponse,
    WebhookResponse,
    WebhookWithSecretResponse,
)
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.logging import tenant_id_ctx_var, user_id_ctx_var
from app.platform.security import limiter
from app.platform.settings import get_settings
from app.services.content_aggregator import _jwt
from app.services.webhook_registration_service import (
    WebhookRegistrationService,
    get_webhook_registration_service,
)

_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/v1/auth/token", auto_error=False)

_FIELD_ERROR_CODES = {
    "url": ("URL_NOT_HTTPS", "webhook url must use HTTPS"),
    "events": ("INVALID_EVENT_TYPE", "unsupported or empty event list"),
    "status": ("INVALID_STATUS", "status must be 'active' or 'disabled'"),
}


def _spec_error(exc: RequestValidationError) -> AppError:
    """Map a body-validation failure onto the spec §6.9 error codes."""
    for err in exc.errors():
        loc = err.get("loc", ())
        if len(loc) < 2 or loc[0] != "body" or loc[1] not in _FIELD_ERROR_CODES:
            continue
        code, message = _FIELD_ERROR_CODES[loc[1]]
        details = None
        if loc[1] == "events":
            supported = [e.value for e in WebhookEventType]
            details = {"unsupported": [err.get("input")], "supported": supported}
        return AppError(code, message, 400, details)
    return AppError("VALIDATION_ERROR", "Request validation failed", 400)


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


async def _require_aggregator_client(
    token: str | None = Depends(_oauth2_scheme),
) -> _jwt.AccessTokenClaims:
    if not token:
        raise UnauthorizedError("Missing authentication token")
    claims = _jwt.decode_access_token(token, secret_key=get_settings().secret_key)
    user_id_ctx_var.set(claims["sub"])
    tenant_id_ctx_var.set(",".join(claims["tenant_ids"]))
    return claims


@router.post("", status_code=201, summary="Register a webhook")
@limiter.limit("100/minute")
async def register_webhook(
    request: Request,
    body: WebhookRegisterRequest,
    claims: _jwt.AccessTokenClaims = Depends(_require_aggregator_client),
    service: WebhookRegistrationService = Depends(get_webhook_registration_service),
) -> WebhookWithSecretResponse:
    webhook, secret = await service.register(claims["sub"], claims["scope"], body)
    return WebhookWithSecretResponse.of_new(webhook, secret)


@router.get("", summary="List own webhooks")
@limiter.limit("300/minute")
async def list_webhooks(
    request: Request,
    claims: _jwt.AccessTokenClaims = Depends(_require_aggregator_client),
    service: WebhookRegistrationService = Depends(get_webhook_registration_service),
) -> WebhookListResponse:
    webhooks = await service.list_for_client(claims["sub"])
    return WebhookListResponse(webhooks=[WebhookResponse.of(w) for w in webhooks])


@router.patch("/{webhook_id}", summary="Update a webhook")
@limiter.limit("100/minute")
async def update_webhook(
    request: Request,
    webhook_id: str,
    body: WebhookUpdateRequest,
    claims: _jwt.AccessTokenClaims = Depends(_require_aggregator_client),
    service: WebhookRegistrationService = Depends(get_webhook_registration_service),
) -> WebhookResponse | WebhookWithSecretResponse:
    webhook, secret = await service.update(claims["sub"], webhook_id, claims["scope"], body)
    if secret is None:
        return WebhookResponse.of(webhook)
    return WebhookWithSecretResponse.of_new(webhook, secret)


@router.delete("/{webhook_id}", status_code=204, summary="Remove a webhook")
@limiter.limit("100/minute")
async def delete_webhook(
    request: Request,
    webhook_id: str,
    claims: _jwt.AccessTokenClaims = Depends(_require_aggregator_client),
    service: WebhookRegistrationService = Depends(get_webhook_registration_service),
) -> None:
    await service.delete(claims["sub"], webhook_id)
