from __future__ import annotations

import asyncio

import pytest

from app.repositories.integration_client_repository import IntegrationClientRepository
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return IntegrationClientRepository(client["test_seeds"])


@pytest.mark.asyncio
async def test_find_client_ids_for_tenant(repo):
    await repo._col.insert_one({"client_id": "client-a", "tenant_ids": ["tenant-a", "tenant-b"]})
    await repo._col.insert_one({"client_id": "client-b", "tenant_ids": ["tenant-b"]})
    await repo._col.insert_one({"client_id": "client-c", "tenant_ids": ["tenant-c"]})

    found = await repo.find_client_ids_for_tenant("tenant-b")
    assert set(found) == {"client-a", "client-b"}


@pytest.mark.asyncio
async def test_find_client_ids_for_tenant_no_match_returns_empty(repo):
    await repo._col.insert_one({"client_id": "client-a", "tenant_ids": ["tenant-a"]})

    assert await repo.find_client_ids_for_tenant("tenant-z") == []


@pytest.mark.asyncio
async def test_reserve_webhook_slot_succeeds_up_to_max_then_fails(repo):
    await repo._col.insert_one({"client_id": "client-a"})

    for _ in range(5):
        assert await repo.reserve_webhook_slot("client-a", 5) is True

    assert await repo.reserve_webhook_slot("client-a", 5) is False
    doc = await repo._col.find_one({"client_id": "client-a"})
    assert doc["webhookCount"] == 5


@pytest.mark.asyncio
async def test_reserve_webhook_slot_concurrent_at_limit_admits_exactly_one(repo):
    await repo._col.insert_one({"client_id": "client-a", "webhookCount": 4})

    results = await asyncio.gather(
        repo.reserve_webhook_slot("client-a", 5),
        repo.reserve_webhook_slot("client-a", 5),
    )

    assert sorted(results) == [False, True]
    doc = await repo._col.find_one({"client_id": "client-a"})
    assert doc["webhookCount"] == 5


@pytest.mark.asyncio
async def test_reserve_webhook_slot_legacy_client_without_webhook_count(repo):
    await repo._col.insert_one({"client_id": "client-a"})

    assert await repo.reserve_webhook_slot("client-a", 5) is True
    doc = await repo._col.find_one({"client_id": "client-a"})
    assert doc["webhookCount"] == 1


@pytest.mark.asyncio
async def test_release_webhook_slot_decrements_count(repo):
    await repo._col.insert_one({"client_id": "client-a", "webhookCount": 2})

    await repo.release_webhook_slot("client-a")
    doc = await repo._col.find_one({"client_id": "client-a"})
    assert doc["webhookCount"] == 1


@pytest.mark.asyncio
async def test_release_webhook_slot_does_not_go_below_zero(repo):
    await repo._col.insert_one({"client_id": "client-a", "webhookCount": 0})

    await repo.release_webhook_slot("client-a")
    doc = await repo._col.find_one({"client_id": "client-a"})
    assert doc["webhookCount"] == 0
