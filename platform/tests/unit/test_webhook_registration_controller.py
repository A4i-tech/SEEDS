from __future__ import annotations

import pytest
from pydantic import ValidationError
from starlette.requests import Request

from app.controllers.webhook_registration_controller import (
    _require_aggregator_client,
    delete_webhook,
    list_webhooks,
    register_webhook,
    update_webhook,
)
from app.main import app as fastapi_app
from app.models.requests.webhook_registration_requests import (
    WebhookRegisterRequest,
    WebhookUpdateRequest,
)
from app.platform.error_handling import AppError, NotFoundError, UnauthorizedError
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from app.services.webhook_registration_service import (
    MAX_WEBHOOKS_PER_CLIENT,
    WebhookRegistrationService,
)
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


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
    return {
        "sub": "client-a",
        "scope": "content:read content:write",
        "tenant_ids": ["tenant-a"],
        "client_name": "partner-a",
    }


@pytest.mark.asyncio
async def test_register_webhook_returns_secret_once(service, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    result = await register_webhook(request_obj, body, claims=claims, service=service)
    assert result.secret
    assert result.status == "active"

    listed = await list_webhooks(request_obj, claims=claims, service=service)
    assert not hasattr(listed.webhooks[0], "secret")


def test_register_webhook_rejects_non_https_url():
    with pytest.raises(ValidationError):
        WebhookRegisterRequest(url="http://x.example.com/hook", events=["job.completed"])


def test_register_webhook_rejects_unsupported_event_type():
    with pytest.raises(ValidationError):
        WebhookRegisterRequest(url="https://x.example.com/hook", events=["not.a.real.event"])


@pytest.mark.asyncio
async def test_register_webhook_rejects_event_outside_granted_scope(service, claims, request_obj):
    claims["scope"] = "content:write"
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["content.deleted"])
    with pytest.raises(AppError) as exc_info:
        await register_webhook(request_obj, body, claims=claims, service=service)
    assert exc_info.value.code == "SCOPE_INSUFFICIENT"
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_register_webhook_enforces_max_per_client(service, claims, request_obj):
    for i in range(MAX_WEBHOOKS_PER_CLIENT):
        body = WebhookRegisterRequest(url=f"https://x.example.com/hook{i}", events=["job.completed"])
        await register_webhook(request_obj, body, claims=claims, service=service)

    body = WebhookRegisterRequest(url="https://x.example.com/hook-extra", events=["job.completed"])
    with pytest.raises(AppError) as exc_info:
        await register_webhook(request_obj, body, claims=claims, service=service)
    assert exc_info.value.code == "WEBHOOK_LIMIT_REACHED"
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_update_webhook_rotates_secret(service, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, service=service)

    update = WebhookUpdateRequest(status="disabled", rotate_secret=True)
    updated = await update_webhook(request_obj, created.webhookId, update, claims=claims, service=service)
    assert updated.status == "disabled"
    assert updated.secret != created.secret


def test_update_webhook_rejects_invalid_status():
    with pytest.raises(ValidationError):
        WebhookUpdateRequest(status="paused")


@pytest.mark.asyncio
async def test_update_webhook_rejects_event_outside_granted_scope(service, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, service=service)

    claims["scope"] = "content:write"
    update = WebhookUpdateRequest(events=["content.deleted"])
    with pytest.raises(AppError) as exc_info:
        await update_webhook(request_obj, created.webhookId, update, claims=claims, service=service)
    assert exc_info.value.code == "SCOPE_INSUFFICIENT"
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_update_webhook_missing_raises_not_found(service, claims, request_obj):
    update = WebhookUpdateRequest(status="disabled")
    with pytest.raises(NotFoundError):
        await update_webhook(request_obj, "6641abc123456789abcdef0", update, claims=claims, service=service)


@pytest.mark.asyncio
async def test_update_webhook_other_client_raises_not_found(service, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, service=service)

    other_claims = {**claims, "sub": "client-b"}
    update = WebhookUpdateRequest(status="disabled")
    with pytest.raises(NotFoundError):
        await update_webhook(request_obj, created.webhookId, update, claims=other_claims, service=service)


@pytest.mark.asyncio
async def test_delete_webhook(service, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, service=service)

    result = await delete_webhook(request_obj, created.webhookId, claims=claims, service=service)
    assert result is None

    with pytest.raises(NotFoundError):
        await delete_webhook(request_obj, created.webhookId, claims=claims, service=service)


@pytest.mark.asyncio
async def test_delete_webhook_other_client_raises_not_found(service, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, service=service)

    other_claims = {**claims, "sub": "client-b"}
    with pytest.raises(NotFoundError):
        await delete_webhook(request_obj, created.webhookId, claims=other_claims, service=service)


@pytest.mark.asyncio
async def test_list_webhooks_excludes_other_client(service, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    await register_webhook(request_obj, body, claims=claims, service=service)

    other_claims = {**claims, "sub": "client-b"}
    listed = await list_webhooks(request_obj, claims=other_claims, service=service)
    assert listed.webhooks == []


@pytest.mark.asyncio
async def test_require_aggregator_client_rejects_missing_token():
    with pytest.raises(UnauthorizedError):
        await _require_aggregator_client(token=None)
