from __future__ import annotations

import pytest

from app.repositories.content_aggregator_item_override_repository import (
    ContentAggregatorItemOverrideRepository,
)
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorItemOverrideRepository(client["test_seeds"])


@pytest.mark.asyncio
async def test_upsert_then_list_by_tree_returns_override(repo):
    choices = [{"value": "a", "text": "A"}]
    await repo.upsert("tenant-a", "subodha", "block-1", "New question?", choices)

    result = await repo.list_by_tree("tenant-a", "subodha", ["block-1", "block-2"])

    assert set(result.keys()) == {"block-1"}
    assert result["block-1"]["question"] == "New question?"
    assert result["block-1"]["choices"] == choices


@pytest.mark.asyncio
async def test_upsert_overwrites_existing_override(repo):
    await repo.upsert("tenant-a", "subodha", "block-1", "Q1", [])
    await repo.upsert("tenant-a", "subodha", "block-1", "Q2", [{"value": "x", "text": "X"}])

    result = await repo.list_by_tree("tenant-a", "subodha", ["block-1"])
    assert result["block-1"]["question"] == "Q2"


@pytest.mark.asyncio
async def test_overrides_isolated_between_tenants(repo):
    await repo.upsert("tenant-a", "subodha", "block-1", "Q1", [])

    result = await repo.list_by_tree("tenant-b", "subodha", ["block-1"])
    assert result == {}


@pytest.mark.asyncio
async def test_overrides_isolated_between_source_types(repo):
    await repo.upsert("tenant-a", "subodha", "block-1", "Q1", [])

    result = await repo.list_by_tree("tenant-a", "hexis", ["block-1"])
    assert result == {}
