from __future__ import annotations

import pytest
from starlette.requests import Request

from app.controllers.webhook_registration_controller import (
    MAX_WEBHOOKS_PER_CLIENT,
    _rate_limit_key,
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
from app.platform.settings import get_settings
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from app.services.content_aggregator import _jwt
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorWebhookRepository(client["test_seeds"])


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
async def test_register_webhook_returns_secret_once(repo, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    result = await register_webhook(request_obj, body, claims=claims, repo=repo)
    assert "secret" in result
    assert result["status"] == "active"

    listed = await list_webhooks(request_obj, claims=claims, repo=repo)
    assert "secret" not in listed["webhooks"][0]


@pytest.mark.asyncio
async def test_register_webhook_rejects_non_https_url(repo, claims, request_obj):
    body = WebhookRegisterRequest(url="http://x.example.com/hook", events=["job.completed"])
    with pytest.raises(AppError) as exc_info:
        await register_webhook(request_obj, body, claims=claims, repo=repo)
    assert exc_info.value.code == "URL_NOT_HTTPS"
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_register_webhook_rejects_unsupported_event_type(repo, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["not.a.real.event"])
    with pytest.raises(AppError) as exc_info:
        await register_webhook(request_obj, body, claims=claims, repo=repo)
    assert exc_info.value.code == "INVALID_EVENT_TYPE"
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_register_webhook_rejects_event_outside_granted_scope(repo, claims, request_obj):
    claims["scope"] = "content:write"
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["content.deleted"])
    with pytest.raises(AppError) as exc_info:
        await register_webhook(request_obj, body, claims=claims, repo=repo)
    assert exc_info.value.code == "SCOPE_INSUFFICIENT"
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_register_webhook_enforces_max_per_client(repo, claims, request_obj):
    for i in range(MAX_WEBHOOKS_PER_CLIENT):
        body = WebhookRegisterRequest(url=f"https://x.example.com/hook{i}", events=["job.completed"])
        await register_webhook(request_obj, body, claims=claims, repo=repo)

    body = WebhookRegisterRequest(url="https://x.example.com/hook-extra", events=["job.completed"])
    with pytest.raises(AppError) as exc_info:
        await register_webhook(request_obj, body, claims=claims, repo=repo)
    assert exc_info.value.code == "WEBHOOK_LIMIT_REACHED"
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_update_webhook_rotates_secret(repo, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, repo=repo)

    update = WebhookUpdateRequest(status="disabled", rotate_secret=True)
    updated = await update_webhook(request_obj, created["webhookId"], update, claims=claims, repo=repo)
    assert updated["status"] == "disabled"
    assert updated["secret"] != created["secret"]


@pytest.mark.asyncio
async def test_update_webhook_rejects_invalid_status(repo, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, repo=repo)

    update = WebhookUpdateRequest(status="paused")
    with pytest.raises(AppError) as exc_info:
        await update_webhook(request_obj, created["webhookId"], update, claims=claims, repo=repo)
    assert exc_info.value.code == "INVALID_STATUS"
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_update_webhook_rejects_event_outside_granted_scope(repo, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, repo=repo)

    claims["scope"] = "content:write"
    update = WebhookUpdateRequest(events=["content.deleted"])
    with pytest.raises(AppError) as exc_info:
        await update_webhook(request_obj, created["webhookId"], update, claims=claims, repo=repo)
    assert exc_info.value.code == "SCOPE_INSUFFICIENT"
    assert exc_info.value.status_code == 403


@pytest.mark.asyncio
async def test_update_webhook_missing_raises_not_found(repo, claims, request_obj):
    update = WebhookUpdateRequest(status="disabled")
    with pytest.raises(NotFoundError):
        await update_webhook(request_obj, "6641abc123456789abcdef0", update, claims=claims, repo=repo)


@pytest.mark.asyncio
async def test_update_webhook_other_client_raises_not_found(repo, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, repo=repo)

    other_claims = {**claims, "sub": "client-b"}
    update = WebhookUpdateRequest(status="disabled")
    with pytest.raises(NotFoundError):
        await update_webhook(request_obj, created["webhookId"], update, claims=other_claims, repo=repo)


@pytest.mark.asyncio
async def test_delete_webhook(repo, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, repo=repo)

    result = await delete_webhook(request_obj, created["webhookId"], claims=claims, repo=repo)
    assert result is None

    with pytest.raises(NotFoundError):
        await delete_webhook(request_obj, created["webhookId"], claims=claims, repo=repo)


@pytest.mark.asyncio
async def test_delete_webhook_other_client_raises_not_found(repo, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(request_obj, body, claims=claims, repo=repo)

    other_claims = {**claims, "sub": "client-b"}
    with pytest.raises(NotFoundError):
        await delete_webhook(request_obj, created["webhookId"], claims=other_claims, repo=repo)


@pytest.mark.asyncio
async def test_list_webhooks_excludes_other_client(repo, claims, request_obj):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    await register_webhook(request_obj, body, claims=claims, repo=repo)

    other_claims = {**claims, "sub": "client-b"}
    listed = await list_webhooks(request_obj, claims=other_claims, repo=repo)
    assert listed["webhooks"] == []


@pytest.mark.asyncio
async def test_require_aggregator_client_rejects_missing_token():
    with pytest.raises(UnauthorizedError):
        await _require_aggregator_client(token=None, auth=None)


def _request_with_auth_header(auth_header: str | None) -> Request:
    headers = [(b"authorization", auth_header.encode())] if auth_header else []
    return Request(
        scope={
            "type": "http",
            "method": "GET",
            "path": "/v1/webhooks",
            "headers": headers,
            "client": ("shared-ip", 1),
            "app": fastapi_app,
        }
    )


def _bearer_for(client_id: str) -> str:
    token, _ = _jwt.encode_access_token(
        client_id=client_id,
        tenant_ids=["tenant-1"],
        scopes=["content:read"],
        client_name="partner",
        secret_key=get_settings().secret_key,
        expires_in="15m",
    )
    return f"Bearer {token}"


def test_rate_limit_key_uses_client_id_from_bearer_token():
    request = _request_with_auth_header(_bearer_for("client-a"))
    assert _rate_limit_key(request) == "client-a"


def test_rate_limit_key_falls_back_to_remote_address_when_missing():
    request = _request_with_auth_header(None)
    assert _rate_limit_key(request) == "shared-ip"


def test_rate_limit_key_falls_back_to_remote_address_when_invalid():
    request = _request_with_auth_header("Bearer not-a-real-token")
    assert _rate_limit_key(request) == "shared-ip"


def test_rate_limit_key_isolates_clients_sharing_source_ip():
    request_a = _request_with_auth_header(_bearer_for("client-a"))
    request_b = _request_with_auth_header(_bearer_for("client-b"))
    assert _rate_limit_key(request_a) != _rate_limit_key(request_b)
