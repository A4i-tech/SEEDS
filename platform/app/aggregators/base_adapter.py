"""SourceAdapter — Adapter pattern base class. Concrete subclasses (one per
content aggregator source) implement build_canonical_nodes/is_empty for their
native fetch format; process_nodes/compute_content_hash are shared, generic
across every source.
"""
from __future__ import annotations

import abc
import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import ClassVar

from app.aggregators.content_strategies import STRATEGY_REGISTRY
from app.aggregators.models import (
    BlobContext,
    CanonicalNode,
    ItemType,
    NodeKind,
    RawItemPayload,
    SourceType,
)
from app.providers.blob_storage import BlobStorageProvider


def _now() -> str:
    return datetime.now(UTC).isoformat()


class SourceAdapter(abc.ABC):
    source_type: ClassVar[SourceType]

    @abc.abstractmethod
    def build_canonical_nodes(
        self, native_course: object, native_content: object, run_id: str, url_map: dict[str, str]
    ) -> list[CanonicalNode]: ...

    @abc.abstractmethod
    def is_empty(self, native_content: object) -> bool: ...

    def make_container(
        self,
        sid: str,
        order: int,
        name: str,
        native: str,
        *,
        root_id: str,
        run_id: str,
        now: str,
        parent: str | None = None,
        meta: dict[str, object] | None = None,
    ) -> CanonicalNode:
        return CanonicalNode(
            source_type=self.source_type, source_id=sid, root_id=root_id,
            parent_id=parent, order=order, node_kind=NodeKind.CONTAINER, item_type=None,
            display_name=name, content=None, lms_url="", native_type=native,
            source_metadata=meta or {}, last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
        )

    def make_item(
        self,
        sid: str,
        parent: str,
        order: int,
        itype: ItemType,
        name: str,
        native: str,
        raw: RawItemPayload,
        meta: dict[str, object],
        *,
        root_id: str,
        run_id: str,
        now: str,
    ) -> CanonicalNode:
        return CanonicalNode(
            source_type=self.source_type, source_id=sid, root_id=root_id,
            parent_id=parent, order=order, node_kind=NodeKind.ITEM, item_type=itype,
            display_name=name, content=None, lms_url="", native_type=native,
            source_metadata=meta, last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
            raw=raw,
        )

    async def process_nodes(
        self,
        nodes: list[CanonicalNode],
        ctx_factory: Callable[[CanonicalNode], BlobContext],
        blob: BlobStorageProvider | None,
    ) -> list[CanonicalNode]:
        processed: list[CanonicalNode] = []
        for node in nodes:
            if node.node_kind == NodeKind.ITEM:
                strategy = STRATEGY_REGISTRY[node.item_type]
                node.content = await strategy.process(node.raw, ctx_factory(node), blob)
            processed.append(node)
        return processed

    def compute_content_hash(self, nodes: list[CanonicalNode]) -> str:
        items = sorted(
            (
                {"source_id": n.source_id, "item_type": n.item_type.value, "raw": n.raw}
                for n in nodes
                if n.node_kind == NodeKind.ITEM
            ),
            key=lambda x: x["source_id"],
        )
        return hashlib.sha256(json.dumps(items, default=str, sort_keys=True).encode()).hexdigest()
