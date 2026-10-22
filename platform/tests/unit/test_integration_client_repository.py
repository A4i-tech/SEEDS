from __future__ import annotations

import pytest

from app.repositories.integration_client_repository import IntegrationClientRepository
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return IntegrationClientRepository(client["test_seeds"])


@pytest.mark.asyncio
async def test_find_active_client_ids_for_tenant(repo):
    await repo._col.insert_one(
        {"client_id": "client-a", "tenant_ids": ["tenant-a", "tenant-b"], "status": "active"}
    )
    await repo._col.insert_one({"client_id": "client-b", "tenant_ids": ["tenant-b"], "status": "active"})
    await repo._col.insert_one({"client_id": "client-c", "tenant_ids": ["tenant-c"], "status": "active"})
    await repo._col.insert_one({"client_id": "client-d", "tenant_ids": ["tenant-b"], "status": "disabled"})

    found = await repo.find_active_client_ids_for_tenant("tenant-b")
    assert set(found) == {"client-a", "client-b"}


@pytest.mark.asyncio
async def test_find_active_client_ids_for_tenant_no_match_returns_empty(repo):
    await repo._col.insert_one({"client_id": "client-a", "tenant_ids": ["tenant-a"], "status": "active"})

    assert await repo.find_active_client_ids_for_tenant("tenant-z") == []
