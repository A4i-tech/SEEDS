"""Content aggregator repository — per-tenant PyMongo async data access for
the contentAggregators collection. Every node (container or item) is one
document scoped by tenant_id — two tenants syncing the same course each get
their own full copy, no cross-tenant sharing.

DTO<->dict conversion happens only here (CanonicalNode.to_doc()/from_doc())
— callers work with CanonicalNode.
"""
from __future__ import annotations

import urllib.parse
from datetime import UTC, datetime
from typing import ClassVar

from pymongo import UpdateOne
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import BulkWriteError

from app.aggregators.models import CanonicalNode, ContentPayload, SourceType
from app.platform.error_handling import NotFoundError

_DUPLICATE_KEY_ERROR_CODE = 11000


def _after_cursor(creation_time: int, key: str | None) -> dict:
    """Exclusive page boundary: strictly older, tie-broken by `content_id`."""
    clause: dict = {"creation_time": {"$lt": creation_time}}
    if key is not None:
        clause = {"$or": [clause, {"creation_time": creation_time, "content_id": {"$lt": key}}]}
    return clause


class ContentAggregatorRepository:
    COLLECTION_NAME: ClassVar[str] = "contentAggregators"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def upsert_tree(
        self, tenant_id: str, source_type: SourceType, root_id: str, nodes: list[CanonicalNode], *, batch_size: int = 20
    ) -> None:
        for i in range(0, len(nodes), batch_size):
            batch = nodes[i : i + batch_size]
            try:
                await self._col.bulk_write(
                    [
                        UpdateOne(
                            {"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id, "source_id": n.source_id},
                            {"$set": n.to_doc() | {"tenant_id": tenant_id}},
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

    @staticmethod
    def _root_filter(tenant_id: str, source_type: SourceType, root_id: str | None = None) -> dict[str, object]:
        query: dict[str, object] = {"tenant_id": tenant_id, "source_type": source_type, "parent_id": None}
        if root_id is not None:
            query["source_id"] = root_id
        return query

    async def is_enrolled(self, tenant_id: str, source_type: SourceType, root_id: str) -> bool:
        doc = await self._col.find_one(self._root_filter(tenant_id, source_type, root_id), {"_id": 1})
        return doc is not None

    async def get_tree(self, tenant_id: str, source_type: SourceType, root_id: str) -> list[CanonicalNode]:
        docs = await (
            self._col.find({"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id})
            .sort("order", 1)
            .to_list(length=None)
        )
        return [CanonicalNode.from_doc(d) for d in docs]

    async def get_root_content_hash(self, tenant_id: str, source_type: SourceType, root_id: str) -> str:
        doc = await self._col.find_one(self._root_filter(tenant_id, source_type, root_id))
        return doc["source_metadata"].get("content_hash", "") if doc else ""

    async def list_roots(
        self,
        tenant_id: str,
        source_type: SourceType,
        *,
        cursor: str = "",
        limit: int = 0,
    ) -> list[CanonicalNode]:
        query = self._root_filter(tenant_id, source_type)
        if cursor:
            query["source_id"] = {"$gt": cursor}
        docs = await self._col.find(query).sort("source_id", 1).limit(limit).to_list(length=None)
        return [CanonicalNode.from_doc(d) for d in docs]

    async def stored_root_ids(self, tenant_id: str, source_type: SourceType) -> set[str]:
        return set(await self._col.distinct("source_id", self._root_filter(tenant_id, source_type)))

    async def delete_tree(self, tenant_id: str, source_type: SourceType, root_id: str) -> int:
        result = await self._col.delete_many({"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id})
        return result.deleted_count

    async def upsert_item(self, tenant_id: str, node: CanonicalNode) -> None:
        await self._col.update_one(
            {"tenant_id": tenant_id, "source_type": node.source_type, "root_id": node.root_id, "source_id": node.source_id},
            {"$set": node.to_doc() | {"tenant_id": tenant_id}},
            upsert=True,
        )

    @staticmethod
    def _client_filter(tenant_id: str, root_id: str, source_id: str = "") -> dict[str, object]:
        query: dict[str, object] = {
            "tenant_id": tenant_id, "source_type": SourceType.PARTNER, "root_id": root_id,
            "is_deleted": {"$ne": True},
        }
        if source_id:
            query["source_id"] = source_id
        return query

    async def get_by_client(self, tenant_id: str, root_id: str, source_id: str) -> CanonicalNode:
        doc = await self._col.find_one(self._client_filter(tenant_id, root_id, source_id))
        if doc is None:
            raise NotFoundError("content item", source_id)
        return CanonicalNode.from_doc(doc)

    async def list_by_client(self, tenant_id: str, root_id: str) -> list[CanonicalNode]:
        docs = await self._col.find(self._client_filter(tenant_id, root_id)).sort("created_at", 1).to_list(length=None)
        return [CanonicalNode.from_doc(d) for d in docs]

    async def soft_delete(self, tenant_id: str, root_id: str, source_id: str, deleted_at: str) -> tuple[bool, int, int]:
        result = await self._col.update_one(
            self._client_filter(tenant_id, root_id, source_id),
            {"$set": {"is_deleted": True, "deleted_at": deleted_at}},
        )
        return result.acknowledged, result.matched_count, result.modified_count

    async def update_item_content(self, tenant_id: str, root_id: str, source_id: str, content: ContentPayload) -> int:
        result = await self._col.update_one(
            self._client_filter(tenant_id, root_id, source_id), {"$set": {"content": content.to_dict()}}
        )
        return result.matched_count

    # ------------------------------------------------------------------
    # Partner-pushed content — contentsV3-shaped docs, tenant-scoped and
    # keyed by `content_id` (not the canonical node key).
    # ------------------------------------------------------------------

    @staticmethod
    def _partner_content_filter(tenant_id: str, content_id: str | None = None) -> dict[str, object]:
        query: dict[str, object] = {
            "tenant_id": tenant_id,
            "content_id": {"$exists": True},
            "is_deleted": {"$ne": True},
        }
        if content_id is not None:
            query["content_id"] = content_id
        return query

    async def upsert_partner_content(self, tenant_id: str, doc: dict) -> None:
        await self._col.update_one(
            {"tenant_id": tenant_id, "content_id": doc["content_id"]},
            {"$set": doc | {"tenant_id": tenant_id}},
            upsert=True,
        )

    async def find_partner_content(self, tenant_id: str, content_id: str) -> dict | None:
        return await self._col.find_one(self._partner_content_filter(tenant_id, content_id))

    async def update_partner_content(self, tenant_id: str, content_id: str, updates: dict) -> dict | None:
        updates = {**updates, "updated_at": datetime.now(UTC)}
        return await self._col.find_one_and_update(
            {"tenant_id": tenant_id, "content_id": content_id, "is_deleted": {"$ne": True}},
            {"$set": updates},
            return_document=True,
        )

    async def soft_delete_partner_content(
        self, tenant_id: str, content_id: str, deleted_at: str
    ) -> tuple[bool, int, int]:
        result = await self._col.update_one(
            {"tenant_id": tenant_id, "content_id": content_id, "is_deleted": {"$ne": True}},
            {"$set": {"is_deleted": True, "updated_at": deleted_at}},
        )
        return result.acknowledged, result.matched_count, result.modified_count

    async def search_partner_content(
        self,
        tenant_id: str,
        *,
        content_ids: list[str] | None = None,
        language: str | None = None,
        theme: str | None = None,
        exp_name: str | None = None,
        only_teacher_app: bool = False,
        after_creation_time: int | None = None,
        after_key: str | None = None,
        limit: int = 16,
    ) -> list[dict]:
        q = self._partner_content_filter(tenant_id)
        clauses: list[dict] = []
        if content_ids:
            clauses.append({"content_id": {"$in": content_ids}})
        if language:
            q["language"] = language
        if theme:
            q["theme.english"] = urllib.parse.unquote(theme)
        if exp_name:
            q["type"] = exp_name.lower()
        if only_teacher_app:
            q["is_teacher_app"] = True
        if after_creation_time is not None:
            clauses.append(_after_cursor(after_creation_time, after_key))
        if clauses:
            q["$and"] = clauses
        return await (
            self._col.find(q).sort([("creation_time", -1), ("content_id", -1)]).to_list(length=limit)
        )
