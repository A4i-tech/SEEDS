"""Quiz repository — Motor async data access for the quizData collection.

All public methods accept plain string IDs. ObjectId conversion for Mongoose-created
fields (tenantId, schoolId) is handled here via the shared _oid helper.
"""

from __future__ import annotations

import urllib.parse

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.base_repository import BaseRepository
from app.repositories.content_repository import _oid


class QuizRepository(BaseRepository):
    COLLECTION = "quizData"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    # ------------------------------------------------------------------
    # Internal query builder (mirrors ContentRepository._tenant_query)
    # ------------------------------------------------------------------

    def _tenant_query(
        self,
        tenant_id: str,
        school_id: str | None = None,
        include_deleted: bool = False,
    ) -> dict:
        q: dict = {"tenantId": _oid(tenant_id)}
        if not include_deleted:
            q["isDeleted"] = {"$ne": True}
        if school_id is not None:
            q["schoolId"] = {"$in": [_oid(school_id), None]}
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
        q = {**self._tenant_query(tenant_id, school_id), "_id": content_id}
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
        limit: int = 16,
    ) -> list[dict]:
        """Paginated quiz list — quiz items only."""
        q = self._tenant_query(tenant_id, school_id)

        if only_teacher_app:
            q["isTeacherApp"] = True
        elif language and theme and exp_name and exp_name.lower() == "quiz":
            q.update({
                "isPullModel": True,
                "language": language,
                "theme.english": urllib.parse.unquote(theme),
            })

        if after_creation_time is not None:
            q["creation_time"] = {"$lte": after_creation_time}

        return await self._col.find(q).sort("creation_time", -1).to_list(length=limit)

    async def find_by_ids(
        self,
        content_ids: list[str],
        tenant_id: str,
        school_id: str | None = None,
    ) -> list[dict]:
        q = {**self._tenant_query(tenant_id, school_id), "_id": {"$in": content_ids}}
        return await self._col.find(q).to_list(length=None)

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    async def insert(self, doc: dict) -> str:
        """Insert a quiz document, coercing tenantId/schoolId to ObjectId."""
        if doc.get("tenantId"):
            doc["tenantId"] = _oid(doc["tenantId"])
        if doc.get("schoolId"):
            doc["schoolId"] = _oid(doc["schoolId"])
        result = await self._col.insert_one(doc)
        return str(result.inserted_id)

    async def soft_delete_by_id_and_tenant(
        self,
        content_id: str,
        tenant_id: str,
        school_id: str | None = None,
    ) -> int:
        from datetime import UTC, datetime
        q = {**self._tenant_query(tenant_id, school_id), "_id": content_id}
        result = await self._col.update_one(
            q, {"$set": {"isDeleted": True, "updatedAt": datetime.now(UTC)}}
        )
        return result.matched_count
