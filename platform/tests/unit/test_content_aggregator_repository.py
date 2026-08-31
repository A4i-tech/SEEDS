from __future__ import annotations

import pytest
from pymongo.errors import BulkWriteError

from app.aggregators.models import AudioContent, CanonicalNode, ItemType, NodeKind, QuizContent, TextContent
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorRepository(client["test_seeds"])


def _course_node(root_id="course-1"):
    return CanonicalNode(
        source_type="subodha", source_id=root_id, root_id=root_id, parent_id=None,
        order=0, node_kind=NodeKind.CONTAINER, item_type=None, display_name="Course One", content=None,
        lms_url=None, native_type="course", source_metadata={}, last_run_id="run-1",
        fetched_at="x", created_at="x", updated_at="x",
    )


def _item_node(root_id="course-1", source_id="block-1"):
    return CanonicalNode(
        source_type="subodha", source_id=source_id, root_id=root_id, parent_id=root_id,
        order=0, node_kind=NodeKind.ITEM, item_type=ItemType.TEXT, display_name="Intro",
        content=TextContent(markdown_url="https://blob/x.md", html_url="https://blob/x.html"),
        lms_url="https://lms/x", native_type="html", source_metadata={}, last_run_id="run-1",
        fetched_at="x", created_at="x", updated_at="x",
    )


def _quiz_item_node(root_id="course-1", source_id="quiz-1"):
    return CanonicalNode(
        source_type="subodha", source_id=source_id, root_id=root_id, parent_id=root_id,
        order=1, node_kind=NodeKind.ITEM, item_type=ItemType.QUIZ, display_name="Q1",
        content=QuizContent(raw_html_url="https://blob/q.raw.html"),
        lms_url="https://lms/q", native_type="problem", source_metadata={}, last_run_id="run-1",
        fetched_at="x", created_at="x", updated_at="x",
    )


@pytest.mark.asyncio
async def test_upsert_tree_scopes_content_by_tenant(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node()])

    tree = await repo.get_tree("tenant-a", "subodha", "course-1")
    assert len(tree) == 1
    assert await repo.get_tree("tenant-b", "subodha", "course-1") == []


@pytest.mark.asyncio
async def test_second_tenant_syncing_same_course_gets_its_own_copy(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node(source_id="block-1")])
    await repo.upsert_tree("tenant-b", "subodha", "course-1", [_course_node(), _item_node(source_id="block-1")])

    tree_a = await repo.get_tree("tenant-a", "subodha", "course-1")
    tree_b = await repo.get_tree("tenant-b", "subodha", "course-1")
    assert len(tree_a) == 2
    assert len(tree_b) == 2


@pytest.mark.asyncio
async def test_upsert_tree_replaces_previous_nodes(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node()])
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node()])
    tree = await repo.get_tree("tenant-a", "subodha", "course-1")
    assert {n.source_id for n in tree} == {"course-1"}


@pytest.mark.asyncio
async def test_get_root_returns_only_the_container_with_no_parent(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node(source_id="block-1")])

    root = await repo.get_root("tenant-a", "subodha", "course-1")
    assert root is not None
    assert root.parent_id is None


@pytest.mark.asyncio
async def test_upsert_tree_batches_writes(repo, monkeypatch):
    real_bulk_write = repo._col.bulk_write
    batch_sizes = []

    async def spy_bulk_write(requests, **kwargs):
        batch_sizes.append(len(requests))
        return await real_bulk_write(requests, **kwargs)

    monkeypatch.setattr(repo._col, "bulk_write", spy_bulk_write)

    nodes = [_course_node()] + [_item_node(source_id=f"block-{i}") for i in range(24)]
    await repo.upsert_tree("tenant-a", "subodha", "course-1", nodes, batch_size=10)

    assert batch_sizes == [10, 10, 5]
    tree = await repo.get_tree("tenant-a", "subodha", "course-1")
    assert len(tree) == 25


@pytest.mark.asyncio
async def test_upsert_tree_survives_partial_batch_failure(repo, monkeypatch):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node(source_id="block-1")])

    real_bulk_write = repo._col.bulk_write
    call_count = {"n": 0}

    async def flaky_bulk_write(requests, **kwargs):
        call_count["n"] += 1
        if call_count["n"] == 2:
            raise RuntimeError("simulated batch failure")
        return await real_bulk_write(requests, **kwargs)

    monkeypatch.setattr(repo._col, "bulk_write", flaky_bulk_write)

    with pytest.raises(RuntimeError):
        await repo.upsert_tree(
            "tenant-a", "subodha", "course-1",
            [_course_node(), _item_node(source_id="block-1"), _item_node(source_id="block-2")],
            batch_size=1,
        )


@pytest.mark.asyncio
async def test_upsert_tree_ignores_duplicate_key_error_from_a_concurrent_writer(repo, monkeypatch):
    real_bulk_write = repo._col.bulk_write

    async def racing_bulk_write(requests, **kwargs):
        # Simulate another tenant's sync winning the race on the unique index
        # before this batch's write landed.
        raise BulkWriteError({"writeErrors": [{"index": 0, "code": 11000, "errmsg": "E11000 duplicate key error"}]})

    monkeypatch.setattr(repo._col, "bulk_write", racing_bulk_write)

    # Does not raise — a pure duplicate-key race is treated as "already written by someone else".
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node()])

    monkeypatch.setattr(repo._col, "bulk_write", real_bulk_write)


@pytest.mark.asyncio
async def test_upsert_tree_still_raises_on_non_duplicate_key_bulk_write_errors(repo, monkeypatch):
    async def failing_bulk_write(requests, **kwargs):
        raise BulkWriteError({"writeErrors": [{"index": 0, "code": 121, "errmsg": "Document failed validation"}]})

    monkeypatch.setattr(repo._col, "bulk_write", failing_bulk_write)

    with pytest.raises(BulkWriteError):
        await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node()])


@pytest.mark.asyncio
async def test_upsert_tree_removes_only_stale_nodes(repo):
    await repo.upsert_tree(
        "tenant-a", "subodha", "course-1",
        [_course_node(), _item_node(source_id="block-1"), _item_node(source_id="block-2")],
    )
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node(source_id="block-1")])

    tree = await repo.get_tree("tenant-a", "subodha", "course-1")
    assert {n.source_id for n in tree} == {"course-1", "block-1"}


@pytest.mark.asyncio
async def test_list_roots_and_stored_root_ids_filter_by_tenant(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node()])
    await repo.upsert_tree("tenant-b", "subodha", "course-2", [_course_node(root_id="course-2")])

    assert await repo.stored_root_ids("tenant-a", "subodha") == {"course-1"}
    roots = await repo.list_roots("tenant-a", "subodha")
    assert [r.source_id for r in roots] == ["course-1"]


@pytest.mark.asyncio
async def test_delete_tree_removes_only_that_tenants_copy(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node(source_id="block-1")])
    await repo.upsert_tree("tenant-b", "subodha", "course-1", [_course_node(), _item_node(source_id="block-1")])

    deleted = await repo.delete_tree("tenant-a", "subodha", "course-1")
    assert deleted == 2
    assert await repo.get_tree("tenant-a", "subodha", "course-1") == []
    assert len(await repo.get_tree("tenant-b", "subodha", "course-1")) == 2


@pytest.mark.asyncio
async def test_delete_tree_returns_zero_when_tenant_was_never_enrolled(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node()])

    deleted = await repo.delete_tree("tenant-b", "subodha", "course-1")
    assert deleted == 0

    tree = await repo.get_tree("tenant-a", "subodha", "course-1")
    assert {n.source_id for n in tree} == {"course-1"}


def _partner_node(client_id="client-1", source_id="item-1"):
    return CanonicalNode(
        source_type="partner", source_id=source_id, root_id=client_id, parent_id=None,
        order=0, node_kind=NodeKind.ITEM, item_type=ItemType.AUDIO, display_name="Story One",
        content=AudioContent(audio_url="https://blob/a.mp3"), lms_url=None, native_type="audio",
        source_metadata={}, last_run_id="partner-push", fetched_at="x", created_at="x", updated_at="x",
        client_id=client_id,
    )


@pytest.mark.asyncio
async def test_upsert_item_then_get_by_client(repo):
    await repo.upsert_item("tenant-a", _partner_node())
    node = await repo.get_by_client("tenant-a", "client-1", "item-1")
    assert node is not None
    assert node.client_id == "client-1"


@pytest.mark.asyncio
async def test_upsert_item_is_idempotent_on_same_source_id(repo):
    await repo.upsert_item("tenant-a", _partner_node())
    await repo.upsert_item("tenant-a", _partner_node())
    items = await repo.list_by_client("tenant-a", "client-1")
    assert len(items) == 1


@pytest.mark.asyncio
async def test_get_by_client_returns_none_for_other_client(repo):
    await repo.upsert_item("tenant-a", _partner_node(client_id="client-1"))
    assert await repo.get_by_client("tenant-a", "client-2", "item-1") is None


@pytest.mark.asyncio
async def test_list_by_client_only_own_root(repo):
    await repo.upsert_item("tenant-a", _partner_node(client_id="client-1", source_id="item-1"))
    await repo.upsert_item("tenant-a", _partner_node(client_id="client-1", source_id="item-2"))
    await repo.upsert_item("tenant-a", _partner_node(client_id="client-2", source_id="item-3"))
    items = await repo.list_by_client("tenant-a", "client-1")
    assert {n.source_id for n in items} == {"item-1", "item-2"}


@pytest.mark.asyncio
async def test_soft_delete_excludes_from_get_and_list(repo):
    await repo.upsert_item("tenant-a", _partner_node())
    modified = await repo.soft_delete("tenant-a", "client-1", "item-1", "2026-08-31T00:00:00+00:00")
    assert modified == 1
    assert await repo.get_by_client("tenant-a", "client-1", "item-1") is None
    assert await repo.list_by_client("tenant-a", "client-1") == []


@pytest.mark.asyncio
async def test_soft_delete_returns_zero_for_already_deleted(repo):
    await repo.upsert_item("tenant-a", _partner_node())
    await repo.soft_delete("tenant-a", "client-1", "item-1", "2026-08-31T00:00:00+00:00")
    modified = await repo.soft_delete("tenant-a", "client-1", "item-1", "2026-08-31T01:00:00+00:00")
    assert modified == 0
