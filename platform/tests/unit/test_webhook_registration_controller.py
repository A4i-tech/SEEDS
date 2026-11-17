from __future__ import annotations

from datetime import UTC, datetime, timedelta

import pytest
from pydantic import ValidationError
from starlette.requests import Request

from app.controllers.webhook_registration_controller import (
    delete_webhook,
    register_webhook,
    update_webhook,
)
from app.main import app as fastapi_app
from app.models.requests.webhook_registration_requests import (
    WebhookRegisterRequest,
    WebhookUpdateRequest,
)
from app.platform.auth.dependencies import require_aggregator_client
from app.platform.error_handling import AppError, NotFoundError, UnauthorizedError
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from app.services import webhook_registration_service, website_extractor
from app.services.content_aggregator._jwt import AccessTokenClaims
from app.services.webhook_registration_service import WebhookRegistrationService


@pytest.fixture(autouse=True)
def _skip_dns(monkeypatch):
    async def _ok(url):
        return url

    monkeypatch.setattr(webhook_registration_service, "_validate_url", _ok)


@pytest.fixture
async def repo(db):
    await ContentAggregatorWebhookRepository.ensure_indexes(db)
    return ContentAggregatorWebhookRepository(db)


@pytest.fixture
def service(repo):
    return WebhookRegistrationService(repo)


@pytest.fixture
def request_obj():
    return Request(
        scope={
            "type": "http",
            "method": "POST",
            "path": "/v1/webhooks",
            "headers": [],
            "client": ("testclient", 1),
            "app": fastapi_app,
        }
    )


@pytest.fixture
def claims():
    now = datetime.now(UTC)
    return AccessTokenClaims(
        sub="client-a",
        iss="seeds-platform",
        iat=now,
        exp=now + timedelta(hours=1),
        jti="jti-a",
        scopes=["content:read", "content:write"],
        tenant_ids=["tenant-a"],
        client_name="partner-a",
    )


@pytest.mark.asyncio
def test_update_webhook_rejects_invalid_status():
    with pytest.raises(ValidationError):
        WebhookUpdateRequest(status="paused")


@pytest.mark.asyncio
async def test_update_webhook_rejects_event_outside_granted_scope(service, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, service=service)

    claims = claims.model_copy(update={"scopes": ["content:read"]})
    update = WebhookUpdateRequest(events=["job.failed"])
    with pytest.raises(AppError) as exc_info:
        await update_webhook(request_obj, created.id, update, claims=claims, service=service)
    assert exc_info.value.code == "SCOPE_INSUFFICIENT"
    assert exc_info.value.status_code == 403


@pytest.fixture
def resolve_to(monkeypatch):
    monkeypatch.setattr(webhook_registration_service, "_validate_url", website_extractor._validate_url)
    socket = website_extractor.socket

    def _resolve(ip):
        monkeypatch.setattr(
            socket, "getaddrinfo", lambda host, port: [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (ip, 0))]
        )

    return _resolve


@pytest.mark.asyncio
@pytest.mark.parametrize("url", ["https://localhost/hook", "https://internal.example.com/hook"])
async def test_register_webhook_rejects_internal_url(resolve_to, service, claims, request_obj, url):
    resolve_to("127.0.0.1")
    body = WebhookRegisterRequest(url=url, events=["job.completed"])
    with pytest.raises(AppError) as exc_info:
        await register_webhook(request_obj, body, claims=claims, service=service)
    assert exc_info.value.code == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_update_webhook_rejects_internal_url(resolve_to, service, claims, request_obj):
    resolve_to("93.184.216.34")
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, service=service)

    resolve_to("10.0.0.1")
    update = WebhookUpdateRequest(url="https://internal.example.com/hook")
    with pytest.raises(AppError) as exc_info:
        await update_webhook(request_obj, created.id, update, claims=claims, service=service)
    assert exc_info.value.code == "VALIDATION_ERROR"


@pytest.mark.asyncio
async def test_update_webhook_missing_raises_not_found(service, claims, request_obj):
    update = WebhookUpdateRequest(status="disabled")
    with pytest.raises(NotFoundError):
        await update_webhook(request_obj, "6641abc123456789abcdef0", update, claims=claims, service=service)


@pytest.mark.asyncio
async def test_update_webhook_other_client_raises_not_found(service, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, service=service)

    other_claims = claims.model_copy(update={"sub": "client-b"})
    update = WebhookUpdateRequest(status="disabled")
    with pytest.raises(NotFoundError):
        await update_webhook(request_obj, created.id, update, claims=other_claims, service=service)


@pytest.mark.asyncio
async def test_delete_webhook(service, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, service=service)

    result = await delete_webhook(request_obj, created.id, claims=claims, service=service)
    assert result is None

    with pytest.raises(NotFoundError):
        await delete_webhook(request_obj, created.id, claims=claims, service=service)


@pytest.mark.asyncio
async def test_require_aggregator_client_rejects_missing_token():
    with pytest.raises(UnauthorizedError):
        await require_aggregator_client(token=None)
