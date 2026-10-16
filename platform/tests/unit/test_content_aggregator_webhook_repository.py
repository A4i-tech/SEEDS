from __future__ import annotations

import pytest

from app.repositories.content_aggregator_webhook_repository import (
    ContentAggregatorWebhookRepository,
)
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorWebhookRepository(client["test_seeds"])


@pytest.mark.asyncio
async def test_create_and_list_for_client(repo):
    doc = await repo.create("client-a", "https://x.example.com/hook", "hash", ["job.completed"])
    assert doc["status"] == "active"

    listed = await repo.list_for_client("client-a")
    assert len(listed) == 1
    assert listed[0]["url"] == "https://x.example.com/hook"


@pytest.mark.asyncio
async def test_webhooks_are_isolated_between_tenants(repo):
    await repo.create("client-a", "https://x.example.com/hook", "hash", ["job.completed"])
    assert await repo.list_for_client("client-b") == []
    assert await repo.count_for_client("client-b") == 0


@pytest.mark.asyncio
async def test_update_delete_for_client(repo):
    doc = await repo.create("client-a", "https://x.example.com/hook", "hash", ["job.completed"])
    webhook_id = str(doc["_id"])

    updated = await repo.update_for_client("client-a", webhook_id, {"status": "disabled"})
    assert updated["status"] == "disabled"

    assert await repo.update_for_client("client-b", webhook_id, {"status": "disabled"}) is None

    deleted = await repo.delete_for_client("client-a", webhook_id)
    assert deleted is True
    assert await repo.delete_for_client("client-a", webhook_id) is False


@pytest.mark.asyncio
async def test_update_for_client_invalid_id_returns_none(repo):
    assert await repo.update_for_client("client-a", "not-an-object-id", {"status": "disabled"}) is None


@pytest.mark.asyncio
async def test_delete_for_client_missing_returns_false(repo):
    assert await repo.delete_for_client("client-a", "6641abc123456789abcdef0") is False


@pytest.mark.asyncio
async def test_find_active_for_client_and_event_excludes_disabled_and_wrong_event(repo):
    disabled = await repo.create("client-a", "https://x.example.com/hook1", "hash", ["job.completed"])
    await repo.update_for_client("client-a", str(disabled["_id"]), {"status": "disabled"})
    await repo.create("client-a", "https://x.example.com/hook2", "hash", ["job.failed"])
    active = await repo.create("client-a", "https://x.example.com/hook3", "hash", ["job.completed"])

    found = await repo.find_active_for_client_and_event("client-a", "job.completed")
    assert [d["_id"] for d in found] == [active["_id"]]


@pytest.mark.asyncio
async def test_find_active_for_client_and_event_excludes_deleted(repo):
    doc = await repo.create("client-a", "https://x.example.com/hook", "hash", ["job.completed"])
    await repo.delete_for_client("client-a", str(doc["_id"]))

    assert await repo.find_active_for_client_and_event("client-a", "job.completed") == []


@pytest.mark.asyncio
async def test_find_active_for_clients_and_event(repo):
    doc_a = await repo.create("client-a", "https://x.example.com/hook-a", "hash", ["job.completed"])
    doc_b = await repo.create("client-b", "https://x.example.com/hook-b", "hash", ["job.completed"])
    await repo.create("client-c", "https://x.example.com/hook-c", "hash", ["job.completed"])

    found = await repo.find_active_for_clients_and_event(["client-a", "client-b"], "job.completed")
    assert {d["_id"] for d in found} == {doc_a["_id"], doc_b["_id"]}


@pytest.mark.asyncio
async def test_find_active_for_clients_and_event_empty_list_returns_empty(repo):
    assert await repo.find_active_for_clients_and_event([], "job.completed") == []
