from __future__ import annotations

import pytest

from app.repositories.subodha_repository import SubodhaRepository
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return SubodhaRepository(client["test_seeds"])


@pytest.mark.asyncio
async def test_save_and_load_course_scoped_to_tenant(repo):
    await repo.save_course("tenant-a", "course-1", {"sourceId": "course-1", "title": "A's copy"})
    await repo.save_course("tenant-b", "course-1", {"sourceId": "course-1", "title": "B's copy"})

    a_doc = await repo.load_course("tenant-a", "course-1")
    b_doc = await repo.load_course("tenant-b", "course-1")
    assert a_doc["title"] == "A's copy"
    assert b_doc["title"] == "B's copy"


@pytest.mark.asyncio
async def test_load_course_returns_none_for_wrong_tenant(repo):
    await repo.save_course("tenant-a", "course-1", {"sourceId": "course-1", "title": "A's copy"})
    assert await repo.load_course("tenant-b", "course-1") is None


@pytest.mark.asyncio
async def test_list_content_only_returns_own_tenant(repo):
    await repo.save_course("tenant-a", "course-1", {"sourceId": "course-1", "title": "A1"})
    await repo.save_course("tenant-b", "course-2", {"sourceId": "course-2", "title": "B1"})

    a_list = await repo.list_content("tenant-a")
    assert [d["sourceId"] for d in a_list] == ["course-1"]


@pytest.mark.asyncio
async def test_stored_source_ids_only_returns_own_tenant(repo):
    await repo.save_course("tenant-a", "course-1", {"sourceId": "course-1"})
    await repo.save_course("tenant-b", "course-2", {"sourceId": "course-2"})

    assert await repo.stored_source_ids("tenant-a") == {"course-1"}


@pytest.mark.asyncio
async def test_delete_course_does_not_affect_other_tenant(repo):
    await repo.save_course("tenant-a", "course-1", {"sourceId": "course-1"})
    await repo.save_course("tenant-b", "course-1", {"sourceId": "course-1"})

    deleted = await repo.delete_course("tenant-a", "course-1")
    assert deleted == 1
    assert await repo.load_course("tenant-a", "course-1") is None
    assert await repo.load_course("tenant-b", "course-1") is not None


@pytest.mark.skip(reason="mongomock does not implement array_filters (real MongoDB does)")
@pytest.mark.asyncio
async def test_update_block_does_not_affect_other_tenant(repo):
    block = {"blockId": "b1", "question": "orig"}
    await repo.save_course("tenant-a", "course-1", {"sourceId": "course-1", "blocks": [block]})
    await repo.save_course("tenant-b", "course-1", {"sourceId": "course-1", "blocks": [block]})

    modified = await repo.update_block("tenant-a", "course-1", "b1", {"question": "edited"})
    assert modified == 1

    a_doc = await repo.load_course("tenant-a", "course-1")
    b_doc = await repo.load_course("tenant-b", "course-1")
    assert a_doc["blocks"][0]["question"] == "edited"
    assert b_doc["blocks"][0]["question"] == "orig"
