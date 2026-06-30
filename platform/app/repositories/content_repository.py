"""Content repository — Motor async data access for the contentsV3 collection.

All public methods accept plain string IDs. ObjectId conversion for Mongoose-created
fields (tenantId, schoolId) is handled here — callers never construct raw query dicts.
"""
from __future__ import annotations

import urllib.parse
import uuid
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.content import Content
from app.repositories.base_repository import BaseRepository


def _oid(id_str: str | None) -> Any:
    """Convert string to BSON ObjectId for querying Mongoose-created documents.

    contentsV3 stores tenantId and schoolId as ObjectId (Mongoose schema type).
    Falls back to the original value when conversion fails (e.g. UUID _ids).
    """
    if id_str is None:
        return None
    try:
        return ObjectId(id_str)
    except Exception:
        return id_str


class ContentRepository(BaseRepository):
    COLLECTION = "contentsV3"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    # ------------------------------------------------------------------
    # Internal query builder
    # ------------------------------------------------------------------

    def _tenant_query(
        self,
        tenant_id: str,
        school_id: str | None = None,
        include_deleted: bool = False,
    ) -> dict:
        """Base query scoped to tenant.

        school_id=None  → no schoolId filter (tenant-wide; e.g. role=tenant)
        school_id=<id>  → schoolId in [ObjectId(id), null] (school + unscoped content)
        """
        q: dict = {"tenantId": _oid(tenant_id)}
        if not include_deleted:
            q["isDeleted"] = {"$ne": True}
        if school_id is not None:
            q["schoolId"] = {"$in": [_oid(school_id), None]}
        return q

    # ------------------------------------------------------------------
    # Single-document reads
    # ------------------------------------------------------------------

    async def find_by_id(self, content_id: str) -> Content | None:
        doc = await self._col.find_one({"_id": content_id})
        return Content.from_mongo(doc) if doc else None

    async def find_raw_by_id(self, content_id: str) -> dict | None:
        return await self._col.find_one({"_id": content_id})

    async def find_by_id_and_tenant(
        self,
        content_id: str,
        tenant_id: str,
        school_id: str | None = None,
    ) -> dict | None:
        q = {**self._tenant_query(tenant_id, school_id), "_id": content_id}
        return await self._col.find_one(q)

    # ------------------------------------------------------------------
    # List reads
    # ------------------------------------------------------------------

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
        """Paginated content list — content-type items only (not quizzes)."""
        q = self._tenant_query(tenant_id, school_id)

        if only_teacher_app:
            q["isTeacherApp"] = True
        elif language and theme and exp_name and exp_name.lower() != "quiz":
            q.update({
                "isPullModel": True,
                "language": language,
                "theme.english": urllib.parse.unquote(theme),
                "type": exp_name.lower(),
            })

        if after_creation_time is not None:
            q["creation_time"] = {"$lte": after_creation_time}

        return await self._col.find(q).sort("creation_time", -1).to_list(length=limit)

    async def find_themes(
        self,
        tenant_id: str,
        language: str,
        school_id: str | None = None,
    ) -> list[dict]:
        q = self._tenant_query(tenant_id, school_id)
        q.update({"language": language, "isPullModel": True})
        return await self._col.find(q).sort("_id", -1).to_list(length=None)

    async def find_by_ids(
        self,
        content_ids: list[str],
        tenant_id: str,
        school_id: str | None = None,
    ) -> list[dict]:
        q = {**self._tenant_query(tenant_id, school_id), "_id": {"$in": content_ids}}
        return await self._col.find(q).to_list(length=None)

    async def find_by_class(self, content_ids: list[str]) -> list[Content]:
        """Fetch content items by IDs for Classroom hydration (no tenant scope)."""
        docs = await self._col.find({"_id": {"$in": content_ids}}).to_list(length=None)
        return [Content.from_mongo(d) for d in docs]

    async def find_by_tenant(
        self,
        tenant_id: str,
        include_deleted: bool = False,
    ) -> list[Content]:
        """Return all content for a tenant as Content model objects."""
        q = self._tenant_query(tenant_id, include_deleted=include_deleted)
        docs = await self._col.find(q).to_list(length=None)
        return [Content.from_mongo(d) for d in docs]

    async def create(self, content: Any) -> Content:
        """Insert a ContentCreate DTO and return the resulting Content model."""
        import time as _time
        doc = content.model_dump() if hasattr(content, "model_dump") else dict(content)
        doc.setdefault("_id", str(uuid.uuid4()))
        doc.setdefault("creation_time", int(_time.time()))
        if doc.get("tenantId"):
            doc["tenantId"] = _oid(doc["tenantId"])
        if doc.get("schoolId"):
            doc["schoolId"] = _oid(doc["schoolId"])
        await self._col.insert_one(doc)
        doc["_id"] = str(doc["_id"])
        return Content.from_mongo(doc)

    # ------------------------------------------------------------------
    # Writes
    # ------------------------------------------------------------------

    async def insert_raw(self, doc: dict) -> str:
        """Insert a raw content document, coercing tenantId/schoolId to ObjectId."""
        doc.setdefault("_id", str(uuid.uuid4()))
        if doc.get("tenantId"):
            doc["tenantId"] = _oid(doc["tenantId"])
        if doc.get("schoolId"):
            doc["schoolId"] = _oid(doc["schoolId"])
        await self._col.insert_one(doc)
        return str(doc["_id"])

    async def update_by_id_and_tenant(
        self,
        content_id: str,
        tenant_id: str,
        updates: dict,
        school_id: str | None = None,
    ) -> dict | None:
        q = {**self._tenant_query(tenant_id, school_id), "_id": content_id}
        updates["updatedAt"] = datetime.now(UTC)
        return await self._col.find_one_and_update(q, {"$set": updates}, return_document=True)

    async def soft_delete_by_id_and_tenant(
        self,
        content_id: str,
        tenant_id: str,
        school_id: str | None = None,
    ) -> int:
        q = {**self._tenant_query(tenant_id, school_id), "_id": content_id}
        result = await self._col.update_one(
            q, {"$set": {"isDeleted": True, "updatedAt": datetime.now(UTC)}}
        )
        return result.matched_count

    async def save_processed(self, content_id: str, fields: dict) -> None:
        await self._col.update_one({"_id": content_id}, {"$set": fields})
