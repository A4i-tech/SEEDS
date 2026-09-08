"""Content aggregator repository — universal, source-agnostic, tenant-scoped
PyMongo async data access for the contentAggregators collection.

Every node (container or item) is one document. DTO<->dict conversion happens
only here (CanonicalNode.to_doc()/from_doc()) — callers work with CanonicalNode.
"""
from __future__ import annotations

from typing import ClassVar

from pymongo import UpdateOne
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import BulkWriteError

from app.aggregators.models import CanonicalNode, ContentPayload

_DUPLICATE_KEY_ERROR_CODE = 11000


class ContentAggregatorRepository:
    COLLECTION_NAME: ClassVar[str] = "contentAggregators"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def upsert_tree(
        self, tenant_id: str, source_type: str, root_id: str, nodes: list[CanonicalNode], *, batch_size: int = 20
    ) -> None:
        for i in range(0, len(nodes), batch_size):
            batch = nodes[i : i + batch_size]
            try:
                await self._col.bulk_write(
                    [
                        UpdateOne(
                            {"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id, "source_id": n.source_id},
                            {"$set": n.to_doc()},
                            upsert=True,
                        )
                        for n in batch
                    ],
                    ordered=False,
                )
            except BulkWriteError as exc:
                write_errors = exc.details.get("writeErrors", [])
                if any(err.get("code") != _DUPLICATE_KEY_ERROR_CODE for err in write_errors):
                    raise
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

    async def list_roots(
        self,
        tenant_id: str,
        source_type: str,
        *,
        cursor: str | None = None,
        limit: int | None = None,
    ) -> list[CanonicalNode]:
        query: dict = {"tenant_id": tenant_id, "source_type": source_type, "parent_id": None}
        if cursor is not None:
            query["source_id"] = {"$gt": cursor}
        find = self._col.find(query).sort("source_id", 1)
        if limit is not None:
            find = find.limit(limit)
        docs = await find.to_list(length=None)
        return [CanonicalNode.from_doc(d) for d in docs]

    async def stored_root_ids(self, tenant_id: str, source_type: str) -> set[str]:
        return set(await self._col.distinct("source_id", {"tenant_id": tenant_id, "source_type": source_type, "parent_id": None}))

    async def delete_tree(self, tenant_id: str, source_type: str, root_id: str) -> int:
        result = await self._col.delete_many({"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id})
        return result.deleted_count

    async def upsert_item(self, node: CanonicalNode) -> None:
        await self._col.update_one(
            {"tenant_id": node.tenant_id, "source_type": node.source_type, "root_id": node.root_id, "source_id": node.source_id},
            {"$set": node.to_doc()},
            upsert=True,
        )

    async def get_by_client(self, tenant_id: str, root_id: str, source_id: str) -> CanonicalNode | None:
        doc = await self._col.find_one(
            {
                "tenant_id": tenant_id, "source_type": "partner", "root_id": root_id,
                "source_id": source_id, "is_deleted": {"$ne": True},
            }
        )
        return CanonicalNode.from_doc(doc) if doc else None

    async def list_by_client(self, tenant_id: str, root_id: str) -> list[CanonicalNode]:
        docs = await (
            self._col.find({"tenant_id": tenant_id, "source_type": "partner", "root_id": root_id, "is_deleted": {"$ne": True}})
            .sort("created_at", 1)
            .to_list(length=None)
        )
        return [CanonicalNode.from_doc(d) for d in docs]

    async def soft_delete(self, tenant_id: str, root_id: str, source_id: str, deleted_at: str) -> int:
        result = await self._col.update_one(
            {
                "tenant_id": tenant_id, "source_type": "partner", "root_id": root_id,
                "source_id": source_id, "is_deleted": {"$ne": True},
            },
            {"$set": {"is_deleted": True, "deleted_at": deleted_at}},
        )
        return result.modified_count

    async def update_item_content(
        self, tenant_id: str, source_type: str, root_id: str, source_id: str, content: ContentPayload
    ) -> int:
        result = await self._col.update_one(
            {"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id, "source_id": source_id},
            {"$set": {"content": content.to_dict()}},
        )
        return result.modified_count
