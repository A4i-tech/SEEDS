"""Quiz repository — PyMongo async data access for the quizData collection.

All public methods accept plain string IDs. ObjectId conversion for Mongoose-created
fields (tenantId, schoolId) is handled here via the shared _oid helper.
"""

from __future__ import annotations

import re
import urllib.parse

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository
from app.repositories.content_repository import _oid


class QuizRepository(BaseRepository):
    COLLECTION = "quizData"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    # ------------------------------------------------------------------
    # Internal query builder (mirrors ContentRepository._tenant_query)
    # ------------------------------------------------------------------

    def _tenant_query(
        self,
        tenant_id: str,
        school_id: str | None,
        strict: bool = False,
        include_deleted: bool = False,
    ) -> dict:
        q: dict = {"tenant_id": _oid(tenant_id)}
        if not include_deleted:
            q["is_deleted"] = {"$ne": True}
        if school_id is not None:
            q["school_id"] = _oid(school_id) if strict else {"$in": [_oid(school_id), None]}
        return q

    # ------------------------------------------------------------------
    # Reads
    # ------------------------------------------------------------------

    async def find_by_id_and_tenant(
        self,
        content_id: str,
        tenant_id: str,
        school_id: str | None = None,
    ) -> dict | None:
        q = {**self._tenant_query(tenant_id, school_id), "_id": self._to_id(content_id)}
        return await self._col.find_one(q)

    async def list_paginated(
        self,
        tenant_id: str,
        school_id: str | None = None,
        language: str | None = None,
        theme: str | None = None,
        exp_name: str | None = None,
        only_teacher_app: bool = False,
        after_creation_time: int | None = None,
        search: str | None = None,
        limit: int = 16,
    ) -> list[dict]:
        """Paginate quiz items, optionally filtered by title search.

        When search is provided, matches title.english or title.local
        case-insensitively. Other filters are applied normally.
        """
        q = self._tenant_query(tenant_id, school_id)

        if only_teacher_app:
            q["is_teacher_app"] = True
        elif language and theme and exp_name and exp_name.lower() == "quiz":
            q.update({
                "is_pull_model": True,
                "language": language,
                "theme.english": urllib.parse.unquote(theme),
            })

        if after_creation_time is not None:
            q["creation_time"] = {"$lte": after_creation_time}

        if search:
            escaped = re.escape(search)
            regex = {"$regex": escaped, "$options": "i"}
            q["$or"] = [
                {"title.english": regex},
                {"title.local": regex},
            ]

        return await self._col.find(q).sort("creation_time", -1).to_list(length=limit)

    async def find_by_ids(
        self,
        content_ids: list[str],
        tenant_id: str,
        school_id: str | None = None,
    ) -> list[dict]:
        q = {**self._tenant_query(tenant_id, school_id), "_id": self._ids_query(content_ids)}
        return await self._col.find(q).to_list(length=None)

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    async def insert(self, doc: dict) -> str:
        """Insert a quiz document, coercing tenant_id/school_id/created_by to ObjectId."""
        if doc.get("tenant_id"):
            doc["tenant_id"] = _oid(doc["tenant_id"])
        if doc.get("school_id"):
            doc["school_id"] = _oid(doc["school_id"])
        if doc.get("created_by"):
            doc["created_by"] = _oid(doc["created_by"])
        result = await self._col.insert_one(doc)
        return str(result.inserted_id)

    async def update_by_id_and_tenant(
        self,
        content_id: str,
        tenant_id: str,
        updates: dict,
        school_id: str | None = None,
    ) -> dict | None:
        from datetime import UTC, datetime
        q = {**self._tenant_query(tenant_id, school_id, strict=True), "_id": self._to_id(content_id)}
        updates["updated_at"] = datetime.now(UTC)
        return await self._col.find_one_and_update(q, {"$set": updates}, return_document=True)

    async def soft_delete_by_id_and_tenant(
        self,
        content_id: str,
        tenant_id: str,
        school_id: str | None = None,
    ) -> int:
        from datetime import UTC, datetime
        q = {**self._tenant_query(tenant_id, school_id, strict=True), "_id": self._to_id(content_id)}
        result = await self._col.update_one(
            q, {"$set": {"is_deleted": True, "updated_at": datetime.now(UTC)}}
        )
        return result.matched_count
