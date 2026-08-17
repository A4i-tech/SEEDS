"""Content aggregator repository — universal, source-agnostic, tenant-scoped
PyMongo async data access for the contentAggregators collection.

Every node (container or item) is one document. DTO<->dict conversion happens
only here (CanonicalNode.to_doc()/from_doc()) — callers work with CanonicalNode.
"""
from __future__ import annotations

import asyncio
from typing import ClassVar

from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.models import CanonicalNode, ContentPayload


class ContentAggregatorRepository:
    COLLECTION_NAME: ClassVar[str] = "contentAggregators"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def upsert_tree(self, tenant_id: str, source_type: str, root_id: str, nodes: list[CanonicalNode]) -> None:
        if nodes:
            await asyncio.gather(
                *(
                    self._col.replace_one(
                        {"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id, "source_id": n.source_id},
                        n.to_doc(),
                        upsert=True,
                    )
                    for n in nodes
                )
            )
        await self._col.delete_many(
            {
                "tenant_id": tenant_id,
                "source_type": source_type,
                "root_id": root_id,
                "source_id": {"$nin": [n.source_id for n in nodes]},
            }
        )

    async def get_tree(self, tenant_id: str, source_type: str, root_id: str) -> list[CanonicalNode]:
        docs = await (
            self._col.find({"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id})
            .sort("order", 1)
            .to_list(length=None)
        )
        return [CanonicalNode.from_doc(d) for d in docs]

    async def get_root(self, tenant_id: str, source_type: str, root_id: str) -> CanonicalNode | None:
        doc = await self._col.find_one(
            {"tenant_id": tenant_id, "source_type": source_type, "source_id": root_id, "parent_id": None}
        )
        return CanonicalNode.from_doc(doc) if doc else None

    async def list_roots(self, tenant_id: str, source_type: str) -> list[CanonicalNode]:
        docs = await self._col.find({"tenant_id": tenant_id, "source_type": source_type, "parent_id": None}).to_list(length=None)
        return [CanonicalNode.from_doc(d) for d in docs]

    async def stored_root_ids(self, tenant_id: str, source_type: str) -> set[str]:
        return set(await self._col.distinct("source_id", {"tenant_id": tenant_id, "source_type": source_type, "parent_id": None}))

    async def delete_tree(self, tenant_id: str, source_type: str, root_id: str) -> int:
        result = await self._col.delete_many({"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id})
        return result.deleted_count

    async def update_item_content(self, tenant_id: str, source_type: str, source_id: str, content: ContentPayload) -> int:
        result = await self._col.update_one(
            {"tenant_id": tenant_id, "source_type": source_type, "source_id": source_id},
            {"$set": {"content": content.to_dict()}},
        )
        return result.modified_count
