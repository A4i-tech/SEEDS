from __future__ import annotations

import pytest

from app.aggregators.base_adapter import SourceAdapter
from app.aggregators.models import BlobContext, CanonicalNode, ItemType, NodeKind


class _FakeAdapter(SourceAdapter):
    source_type = "fake"

    def build_canonical_nodes(self, native_course, native_content, run_id, url_map):
        raise NotImplementedError

    def is_empty(self, native_content):
        raise NotImplementedError


def _node(source_id, item_type, raw, root_id="root-1", parent_id="root-1"):
    node = CanonicalNode(
        source_type="fake", source_id=source_id, root_id=root_id, parent_id=parent_id,
        order=0, node_kind=NodeKind.ITEM, item_type=item_type, display_name="x", content=None,
        lms_url=None, native_type=item_type.value, source_metadata={}, last_run_id="run-1",
        fetched_at="x", created_at="x", updated_at="x",
    )
    node.raw = raw  # attached only pre-processing; process_nodes consumes and clears it
    return node


@pytest.mark.asyncio
async def test_process_nodes_fills_content_for_item_nodes_only():
    adapter = _FakeAdapter()
    root = CanonicalNode(
        source_type="fake", source_id="root-1", root_id="root-1", parent_id=None,
        order=0, node_kind=NodeKind.CONTAINER, item_type=None, display_name="root", content=None,
        lms_url=None, native_type="course", source_metadata={}, last_run_id="run-1",
        fetched_at="x", created_at="x", updated_at="x",
    )
    item = _node("item-1", ItemType.OTHER, {"whatever": "shape"})

    def ctx_factory(node: CanonicalNode) -> BlobContext:
        return BlobContext(container="subodha", blob_prefix=f"items/{node.source_id}")

    processed = await adapter.process_nodes([root, item], ctx_factory, blob=None)
    by_id = {n.source_id: n for n in processed}

    assert by_id["root-1"].content is None
    assert by_id["item-1"].content.payload == {"whatever": "shape"}


def test_compute_content_hash_stable_and_sensitive_to_raw_changes():
    adapter = _FakeAdapter()
    item_a = _node("item-1", ItemType.OTHER, {"v": 1})
    item_b = _node("item-1", ItemType.OTHER, {"v": 1})
    item_c = _node("item-1", ItemType.OTHER, {"v": 2})

    assert adapter.compute_content_hash([item_a]) == adapter.compute_content_hash([item_b])
    assert adapter.compute_content_hash([item_a]) != adapter.compute_content_hash([item_c])
