from __future__ import annotations

import asyncio

import pytest

from app.models.requests.webhook_registration_requests import WebhookEventType, WebhookStatus
from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
async def repo():
    client = AsyncMongoMockClient()
    db = client["test_seeds"]
    await ContentAggregatorWebhookRepository.ensure_indexes(db)
    return ContentAggregatorWebhookRepository(db)


@pytest.mark.asyncio
async def test_create_and_list_for_client(repo):
    doc = await repo.create("client-a", "https://x.example.com/hook", "hash", [WebhookEventType.JOB_COMPLETED])
    assert doc.status == WebhookStatus.ACTIVE

    listed = await repo.list_for_client("client-a")
    assert len(listed) == 1
    assert listed[0].url == "https://x.example.com/hook"


@pytest.mark.asyncio
async def test_webhooks_are_isolated_between_tenants(repo):
    await repo.create("client-a", "https://x.example.com/hook", "hash", [WebhookEventType.JOB_COMPLETED])
    assert await repo.list_for_client("client-b") == []


@pytest.mark.asyncio
async def test_update_delete_for_client(repo):
    doc = await repo.create("client-a", "https://x.example.com/hook", "hash", [WebhookEventType.JOB_COMPLETED])
    webhook_id = doc.id

    updated = await repo.update_for_client(
        "client-a", webhook_id, updates={"status": WebhookStatus.DISABLED.value}
    )
    assert updated.status == WebhookStatus.DISABLED

    assert (
        await repo.update_for_client(
            "client-b", webhook_id, updates={"status": WebhookStatus.DISABLED.value}
        )
        is None
    )

    deleted = await repo.delete_for_client("client-a", webhook_id)
    assert deleted is True
    assert await repo.delete_for_client("client-a", webhook_id) is False


@pytest.mark.asyncio
async def test_update_for_client_invalid_id_returns_none(repo):
    assert (
        await repo.update_for_client(
            "client-a", "not-an-object-id", updates={"status": WebhookStatus.DISABLED.value}
        )
        is None
    )


@pytest.mark.asyncio
async def test_delete_for_client_missing_returns_false(repo):
    assert await repo.delete_for_client("client-a", "6641abc123456789abcdef0") is False


@pytest.mark.asyncio
async def test_find_active_for_client_and_event_excludes_disabled_and_wrong_event(repo):
    disabled = await repo.create("client-a", "https://x.example.com/hook1", "hash", [WebhookEventType.JOB_COMPLETED])
    await repo.update_for_client("client-a", disabled.id, updates={"status": WebhookStatus.DISABLED.value})
    await repo.create("client-a", "https://x.example.com/hook2", "hash", [WebhookEventType.JOB_FAILED])
    active = await repo.create("client-a", "https://x.example.com/hook3", "hash", [WebhookEventType.JOB_COMPLETED])

    found = await repo.find_active_for_clients_and_event(["client-a"], WebhookEventType.JOB_COMPLETED)
    assert [d.id for d in found] == [active.id]


@pytest.mark.asyncio
async def test_find_active_for_client_and_event_excludes_deleted(repo):
    doc = await repo.create("client-a", "https://x.example.com/hook", "hash", [WebhookEventType.JOB_COMPLETED])
    await repo.delete_for_client("client-a", doc.id)

    assert await repo.find_active_for_clients_and_event(["client-a"], WebhookEventType.JOB_COMPLETED) == []


@pytest.mark.asyncio
async def test_find_active_for_clients_and_event(repo):
    doc_a = await repo.create("client-a", "https://x.example.com/hook-a", "hash", [WebhookEventType.JOB_COMPLETED])
    doc_b = await repo.create("client-b", "https://x.example.com/hook-b", "hash", [WebhookEventType.JOB_COMPLETED])
    await repo.create("client-c", "https://x.example.com/hook-c", "hash", [WebhookEventType.JOB_COMPLETED])

    found = await repo.find_active_for_clients_and_event(["client-a", "client-b"], WebhookEventType.JOB_COMPLETED)
    assert {d.id for d in found} == {doc_a.id, doc_b.id}


@pytest.mark.asyncio
async def test_find_active_for_clients_and_event_empty_list_returns_empty(repo):
    assert await repo.find_active_for_clients_and_event([], WebhookEventType.JOB_COMPLETED) == []


@pytest.mark.asyncio
async def test_create_rejects_sixth_webhook_for_client(repo):
    for _ in range(5):
        webhook = await repo.create(
            "client-a", "https://x.example.com/hook", "hash", [WebhookEventType.JOB_COMPLETED], limit=5
        )
        assert webhook is not None

    assert await repo.create(
        "client-a", "https://x.example.com/hook", "hash", [WebhookEventType.JOB_COMPLETED], limit=5
    ) is None


@pytest.mark.asyncio
async def test_create_concurrent_at_limit_admits_exactly_one(repo):
    for _ in range(4):
        await repo.create(
            "client-a", "https://x.example.com/hook", "hash", [WebhookEventType.JOB_COMPLETED], limit=5
        )

    results = await asyncio.gather(
        repo.create("client-a", "https://x.example.com/hook", "hash", [WebhookEventType.JOB_COMPLETED], limit=5),
        repo.create("client-a", "https://x.example.com/hook", "hash", [WebhookEventType.JOB_COMPLETED], limit=5),
    )

    assert sorted(r is None for r in results) == [False, True]
    assert len(await repo.list_for_client("client-a")) == 5
