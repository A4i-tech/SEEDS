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
async def test_create_and_list_for_tenant(repo):
    doc = await repo.create("tenant-a", "https://x.example.com/hook", "hash", ["job.completed"])
    assert doc["status"] == "active"

    listed = await repo.list_for_tenant("tenant-a")
    assert len(listed) == 1
    assert listed[0]["url"] == "https://x.example.com/hook"


@pytest.mark.asyncio
async def test_webhooks_are_isolated_between_tenants(repo):
    await repo.create("tenant-a", "https://x.example.com/hook", "hash", ["job.completed"])
    assert await repo.list_for_tenant("tenant-b") == []
    assert await repo.count_for_tenant("tenant-b") == 0


@pytest.mark.asyncio
async def test_get_update_delete_for_tenant(repo):
    doc = await repo.create("tenant-a", "https://x.example.com/hook", "hash", ["job.completed"])
    webhook_id = str(doc["_id"])

    fetched = await repo.get_for_tenant("tenant-a", webhook_id)
    assert fetched is not None

    assert await repo.get_for_tenant("tenant-b", webhook_id) is None

    updated = await repo.update_for_tenant("tenant-a", webhook_id, {"status": "disabled"})
    assert updated["status"] == "disabled"

    deleted = await repo.delete_for_tenant("tenant-a", webhook_id)
    assert deleted is True
    assert await repo.get_for_tenant("tenant-a", webhook_id) is None


@pytest.mark.asyncio
async def test_get_for_tenant_invalid_id_returns_none(repo):
    assert await repo.get_for_tenant("tenant-a", "not-an-object-id") is None


@pytest.mark.asyncio
async def test_delete_for_tenant_missing_returns_false(repo):
    assert await repo.delete_for_tenant("tenant-a", "6641abc123456789abcdef0") is False
