from __future__ import annotations

import pytest

from app.controllers.webhook_registration_controller import (
    MAX_WEBHOOKS_PER_CLIENT,
    delete_webhook,
    list_webhooks,
    register_webhook,
    update_webhook,
)
from app.models.requests.webhook_registration_requests import (
    WebhookRegisterRequest,
    WebhookUpdateRequest,
)
from app.platform.error_handling import AppError, NotFoundError
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorWebhookRepository(client["test_seeds"])


@pytest.fixture
def user():
    return {"role": "tenant", "tenant_id": "tenant-a"}


@pytest.mark.asyncio
async def test_register_webhook_returns_secret_once(repo, user):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    result = await register_webhook(body, user=user, repo=repo)
    assert "secret" in result
    assert result["status"] == "active"

    listed = await list_webhooks(user=user, repo=repo)
    assert "secret" not in listed["webhooks"][0]


@pytest.mark.asyncio
async def test_register_webhook_rejects_non_https_url(repo, user):
    body = WebhookRegisterRequest(url="http://x.example.com/hook", events=["job.completed"])
    with pytest.raises(AppError) as exc_info:
        await register_webhook(body, user=user, repo=repo)
    assert exc_info.value.code == "URL_NOT_HTTPS"
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_register_webhook_rejects_unsupported_event_type(repo, user):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["not.a.real.event"])
    with pytest.raises(AppError) as exc_info:
        await register_webhook(body, user=user, repo=repo)
    assert exc_info.value.code == "INVALID_EVENT_TYPE"
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_register_webhook_enforces_max_per_client(repo, user):
    for i in range(MAX_WEBHOOKS_PER_CLIENT):
        body = WebhookRegisterRequest(url=f"https://x.example.com/hook{i}", events=["job.completed"])
        await register_webhook(body, user=user, repo=repo)

    body = WebhookRegisterRequest(url="https://x.example.com/hook-extra", events=["job.completed"])
    with pytest.raises(AppError) as exc_info:
        await register_webhook(body, user=user, repo=repo)
    assert exc_info.value.code == "WEBHOOK_LIMIT_REACHED"
    assert exc_info.value.status_code == 409


@pytest.mark.asyncio
async def test_update_webhook_rotates_secret(repo, user):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(body, user=user, repo=repo)

    update = WebhookUpdateRequest(status="disabled", rotate_secret=True)
    updated = await update_webhook(created["webhookId"], update, user=user, repo=repo)
    assert updated["status"] == "disabled"
    assert updated["secret"] != created["secret"]


@pytest.mark.asyncio
async def test_update_webhook_rejects_invalid_status(repo, user):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(body, user=user, repo=repo)

    update = WebhookUpdateRequest(status="paused")
    with pytest.raises(AppError) as exc_info:
        await update_webhook(created["webhookId"], update, user=user, repo=repo)
    assert exc_info.value.code == "INVALID_STATUS"
    assert exc_info.value.status_code == 400


@pytest.mark.asyncio
async def test_update_webhook_missing_raises_not_found(repo, user):
    update = WebhookUpdateRequest(status="disabled")
    with pytest.raises(NotFoundError):
        await update_webhook("6641abc123456789abcdef0", update, user=user, repo=repo)


@pytest.mark.asyncio
async def test_update_webhook_other_tenant_raises_not_found(repo, user):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(body, user=user, repo=repo)

    other_user = {"role": "tenant", "tenant_id": "tenant-b"}
    update = WebhookUpdateRequest(status="disabled")
    with pytest.raises(NotFoundError):
        await update_webhook(created["webhookId"], update, user=other_user, repo=repo)


@pytest.mark.asyncio
async def test_delete_webhook(repo, user):
    body = WebhookRegisterRequest(url="https://x.example.com/hook", events=["job.completed"])
    created = await register_webhook(body, user=user, repo=repo)

    result = await delete_webhook(created["webhookId"], user=user, repo=repo)
    assert result is None

    with pytest.raises(NotFoundError):
        await delete_webhook(created["webhookId"], user=user, repo=repo)
