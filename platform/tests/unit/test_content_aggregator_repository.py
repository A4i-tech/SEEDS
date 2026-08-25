from __future__ import annotations

import pytest

from app.aggregators.models import CanonicalNode, ItemType, NodeKind, QuizContent, TextContent
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.fixture
def repo():
    client = AsyncMongoMockClient()
    return ContentAggregatorRepository(client["test_seeds"])


def _course_node(root_id="course-1", tenant_id="tenant-a"):
    return CanonicalNode(
        tenant_id=tenant_id, source_type="subodha", source_id=root_id, root_id=root_id, parent_id=None,
        order=0, node_kind=NodeKind.CONTAINER, item_type=None, display_name="Course One", content=None,
        lms_url=None, native_type="course", source_metadata={}, last_run_id="run-1",
        fetched_at="x", created_at="x", updated_at="x",
    )


def _item_node(root_id="course-1", source_id="block-1", tenant_id="tenant-a"):
    return CanonicalNode(
        tenant_id=tenant_id, source_type="subodha", source_id=source_id, root_id=root_id, parent_id=root_id,
        order=0, node_kind=NodeKind.ITEM, item_type=ItemType.MARKDOWN, display_name="Intro",
        content=TextContent(markdown_url="https://blob/x.md", html_url="https://blob/x.html"),
        lms_url="https://lms/x", native_type="html", source_metadata={}, last_run_id="run-1",
        fetched_at="x", created_at="x", updated_at="x",
    )


def _quiz_item_node(root_id="course-1", source_id="quiz-1", tenant_id="tenant-a"):
    return CanonicalNode(
        tenant_id=tenant_id, source_type="subodha", source_id=source_id, root_id=root_id, parent_id=root_id,
        order=1, node_kind=NodeKind.ITEM, item_type=ItemType.QUIZ, display_name="Q1",
        content=QuizContent(raw_html_url="https://blob/q.raw.html"),
        lms_url="https://lms/q", native_type="problem", source_metadata={}, last_run_id="run-1",
        fetched_at="x", created_at="x", updated_at="x",
    )


@pytest.mark.asyncio
async def test_upsert_and_get_tree_scoped_to_tenant(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node()])
    await repo.upsert_tree("tenant-b", "subodha", "course-1", [_course_node(tenant_id="tenant-b")])

    a_tree = await repo.get_tree("tenant-a", "subodha", "course-1")
    b_tree = await repo.get_tree("tenant-b", "subodha", "course-1")
    assert {n.source_id for n in a_tree} == {"course-1", "block-1"}
    assert {n.source_id for n in b_tree} == {"course-1"}


@pytest.mark.asyncio
async def test_upsert_tree_replaces_previous_nodes(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node()])
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node()])
    tree = await repo.get_tree("tenant-a", "subodha", "course-1")
    assert {n.source_id for n in tree} == {"course-1"}


@pytest.mark.asyncio
async def test_get_root_returns_only_the_container_with_no_parent(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node()])
    root = await repo.get_root("tenant-a", "subodha", "course-1")
    assert root.source_id == "course-1"
    assert root.parent_id is None


@pytest.mark.asyncio
async def test_upsert_tree_survives_partial_write_failure(repo, monkeypatch):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node()])

    real_bulk_write = repo._col.bulk_write

    async def flaky_bulk_write(requests, **kwargs):
        if any(req._filter["source_id"] == "block-2" for req in requests):
            raise RuntimeError("simulated write failure")
        return await real_bulk_write(requests, **kwargs)

    monkeypatch.setattr(repo._col, "bulk_write", flaky_bulk_write)

    with pytest.raises(RuntimeError):
        await repo.upsert_tree(
            "tenant-a", "subodha", "course-1",
            [_course_node(), _item_node(source_id="block-2")],
        )

    tree = await repo.get_tree("tenant-a", "subodha", "course-1")
    assert {n.source_id for n in tree} == {"course-1", "block-1"}


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
async def test_list_roots_and_stored_root_ids_only_own_tenant(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node("course-1")])
    await repo.upsert_tree("tenant-a", "subodha", "course-2", [_course_node("course-2")])
    await repo.upsert_tree("tenant-b", "subodha", "course-3", [_course_node("course-3", tenant_id="tenant-b")])

    roots = await repo.list_roots("tenant-a", "subodha")
    assert {r.source_id for r in roots} == {"course-1", "course-2"}
    assert await repo.stored_root_ids("tenant-a", "subodha") == {"course-1", "course-2"}


@pytest.mark.asyncio
async def test_delete_tree_does_not_affect_other_tenant(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _item_node()])
    await repo.upsert_tree("tenant-b", "subodha", "course-1", [_course_node(tenant_id="tenant-b")])

    deleted = await repo.delete_tree("tenant-a", "subodha", "course-1")
    assert deleted == 2
    assert await repo.get_tree("tenant-a", "subodha", "course-1") == []
    assert len(await repo.get_tree("tenant-b", "subodha", "course-1")) == 1


@pytest.mark.asyncio
async def test_update_item_content_scoped_to_tenant(repo):
    await repo.upsert_tree("tenant-a", "subodha", "course-1", [_course_node(), _quiz_item_node()])
    await repo.upsert_tree("tenant-b", "subodha", "course-1", [_course_node(tenant_id="tenant-b"), _quiz_item_node(tenant_id="tenant-b")])

    new_content = QuizContent(raw_html_url="https://blob/q.raw.html", question="edited", choices=[])
    modified = await repo.update_item_content("tenant-a", "subodha", "quiz-1", new_content)
    assert modified == 1

    a_item = next(n for n in await repo.get_tree("tenant-a", "subodha", "course-1") if n.source_id == "quiz-1")
    b_item = next(n for n in await repo.get_tree("tenant-b", "subodha", "course-1") if n.source_id == "quiz-1")
    assert a_item.content == new_content
    assert b_item.content.question is None
