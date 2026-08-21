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
async def test_upsert_and_list_by_tree(repo):
    await repo.upsert("tenant-a", "subodha", "quiz-1", "Edited question?", [{"id": "a", "text": "Yes"}])

    overrides = await repo.list_by_tree("tenant-a", "subodha", ["quiz-1", "quiz-2"])
    assert set(overrides.keys()) == {"quiz-1"}
    assert overrides["quiz-1"]["question"] == "Edited question?"
    assert overrides["quiz-1"]["choices"] == [{"id": "a", "text": "Yes"}]


@pytest.mark.asyncio
async def test_upsert_overwrites_previous_edit(repo):
    await repo.upsert("tenant-a", "subodha", "quiz-1", "First edit", [])
    await repo.upsert("tenant-a", "subodha", "quiz-1", "Second edit", [{"id": "a", "text": "X"}])

    overrides = await repo.list_by_tree("tenant-a", "subodha", ["quiz-1"])
    assert overrides["quiz-1"]["question"] == "Second edit"


@pytest.mark.asyncio
async def test_overrides_are_isolated_between_tenants(repo):
    await repo.upsert("tenant-a", "subodha", "quiz-1", "A's edit", [])
    await repo.upsert("tenant-b", "subodha", "quiz-1", "B's edit", [])

    a_overrides = await repo.list_by_tree("tenant-a", "subodha", ["quiz-1"])
    b_overrides = await repo.list_by_tree("tenant-b", "subodha", ["quiz-1"])
    assert a_overrides["quiz-1"]["question"] == "A's edit"
    assert b_overrides["quiz-1"]["question"] == "B's edit"


@pytest.mark.asyncio
async def test_list_by_tree_empty_when_no_overrides(repo):
    assert await repo.list_by_tree("tenant-a", "subodha", ["quiz-1"]) == {}
