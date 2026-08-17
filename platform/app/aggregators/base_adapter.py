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
from typing import ClassVar

from app.aggregators.content_strategies import STRATEGY_REGISTRY
from app.aggregators.models import BlobContext, CanonicalNode, NodeKind, RawItemPayload
from app.providers.blob_storage import BlobStorageProvider


class SourceAdapter(abc.ABC):
    source_type: ClassVar[str]

    @abc.abstractmethod
    def build_canonical_nodes(
        self, native_course: object, native_content: object, run_id: str, url_map: dict[str, str]
    ) -> list[CanonicalNode]: ...

    @abc.abstractmethod
    def is_empty(self, native_content: object) -> bool: ...

    async def process_nodes(
        self,
        nodes: list[CanonicalNode],
        ctx_factory: Callable[[CanonicalNode], BlobContext],
        blob: BlobStorageProvider | None,
    ) -> list[CanonicalNode]:
        processed: list[CanonicalNode] = []
        for node in nodes:
            if node.node_kind == NodeKind.ITEM:
                raw: RawItemPayload = getattr(node, "raw", None)
                strategy = STRATEGY_REGISTRY[node.item_type]
                node.content = await strategy.process(raw, ctx_factory(node), blob)
            processed.append(node)
        return processed

    def compute_content_hash(self, nodes: list[CanonicalNode]) -> str:
        items = sorted(
            (
                {"source_id": n.source_id, "item_type": n.item_type.value, "raw": getattr(n, "raw", None)}
                for n in nodes
                if n.node_kind == NodeKind.ITEM
            ),
            key=lambda x: x["source_id"],
        )
        return hashlib.sha256(json.dumps(items, default=str, sort_keys=True).encode()).hexdigest()
