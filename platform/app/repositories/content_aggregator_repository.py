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

from app.aggregators.models import CanonicalNode
from app.models.requests.content_aggregator_content_requests import Cursor
from app.platform.error_handling import NotFoundError
from app.repositories.content_repository import after_cursor_clause

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

    async def is_enrolled(self, tenant_id: str, source_type: str, root_id: str) -> bool:
        doc = await self._col.find_one(
            {"tenant_id": tenant_id, "source_type": source_type, "source_id": root_id, "parent_id": None},
            {"_id": 1},
        )
        return doc is not None

    async def get_tree(self, tenant_id: str, source_type: str, root_id: str) -> list[CanonicalNode]:
        docs = await (
            self._col.find({"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id})
            .sort("order", 1)
            .to_list(length=None)
        )
        return [CanonicalNode.from_doc(d) for d in docs]

    async def get_root(self, tenant_id: str, source_type: str, root_id: str) -> CanonicalNode | None:
        doc = await self._col.find_one({"tenant_id": tenant_id, "source_type": source_type, "source_id": root_id, "parent_id": None})
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
        return set(
            await self._col.distinct("source_id", {"tenant_id": tenant_id, "source_type": source_type, "parent_id": None})
        )

    async def delete_tree(self, tenant_id: str, source_type: str, root_id: str) -> int:
        result = await self._col.delete_many({"tenant_id": tenant_id, "source_type": source_type, "root_id": root_id})
        return result.deleted_count

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

    async def insert_partner_content_if_absent(self, tenant_id: str, doc: dict) -> tuple[dict, bool]:
        result = await self._col.update_one(
            {"tenant_id": tenant_id, "content_id": doc["content_id"]},
            {"$setOnInsert": doc | {"tenant_id": tenant_id}},
            upsert=True,
        )
        stored = await self._col.find_one({"tenant_id": tenant_id, "content_id": doc["content_id"]})
        return stored, result.upserted_id is not None

    async def find_partner_content(self, tenant_id: str, content_id: str) -> dict:
        doc = await self._col.find_one(self._partner_content_filter(tenant_id, content_id))
        if doc is None:
            raise NotFoundError("content item", content_id)
        return doc

    async def update_partner_content(self, tenant_id: str, content_id: str, updates: dict) -> dict:
        updates = {**updates, "updated_at": datetime.now(UTC)}
        doc = await self._col.find_one_and_update(
            {"tenant_id": tenant_id, "content_id": content_id, "is_deleted": {"$ne": True}},
            {"$set": updates},
            return_document=True,
        )
        if doc is None:
            raise NotFoundError("content item", content_id)
        return doc

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
        cursor: Cursor | None = None,
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
        if cursor is not None:
            clauses.append(after_cursor_clause(cursor))
        if clauses:
            q["$and"] = clauses
        return await (
            self._col.find(q).sort([("creation_time", -1), ("content_id", -1)]).to_list(length=limit)
        )
