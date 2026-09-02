"""Content repository — PyMongo async data access for the contentsV3 collection.

All public methods accept plain string IDs. ObjectId conversion for Mongoose-created
fields (tenant_id, school_id) is handled here — callers never construct raw query dicts.
"""
from __future__ import annotations

import re
import urllib.parse
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from bson.errors import InvalidId
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content import Content
from app.models.responses.content import AudioContent
from app.platform.error_handling import ValidationError
from app.repositories.base_repository import BaseRepository


def _oid(id_str: str | None) -> ObjectId | None:
    """Convert string to BSON ObjectId for querying Mongoose-created documents.

    contentsV3 stores tenant_id and school_id as ObjectId (Mongoose schema type).
    Raises if id_str isn't a valid ObjectId — no silent string fallback.
    """
    if id_str is None:
        return None
    try:
        return ObjectId(id_str)
    except InvalidId as exc:
        raise ValidationError(
            f"'{id_str}' is not a valid id. Use the exact 24-character id returned by the API, not a shortened or made-up value."
        ) from exc


class ContentRepository(BaseRepository):
    COLLECTION = "contentsV3"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    def _tenant_query(
        self,
        tenant_id: str,
        school_id: str | None,
        strict: bool = False,
        include_deleted: bool = False,
    ) -> dict:
        """Base query scoped to tenant.

        school_id=None  → no school_id filter (tenant-wide; e.g. role=tenant)
        school_id=<id>, strict=False → school_id in [ObjectId(id), null] (school + unscoped content; reads)
        school_id=<id>, strict=True  → school_id == ObjectId(id) only (writes; must not touch tenant-owned content)
        """
        q: dict = {"tenant_id": _oid(tenant_id)}
        if not include_deleted:
            q["is_deleted"] = {"$ne": True}
        if school_id is not None:
            q["school_id"] = _oid(school_id) if strict else {"$in": [_oid(school_id), None]}
        return q

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
    ) -> AudioContent | None:
        q = {**self._tenant_query(tenant_id, school_id), "_id": content_id}
        doc = await self._col.find_one(q)
        return AudioContent.from_doc(doc) if doc else None

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
    ) -> list[AudioContent]:
        """Paginate content items, optionally filtered by title search.

        When search is provided, matches title.english or title.local
        case-insensitively. Other filters are applied normally.
        """
        q = self._tenant_query(tenant_id, school_id)

        if only_teacher_app:
            q["is_teacher_app"] = True
        elif language and theme and exp_name and exp_name.lower() != "quiz":
            q.update({
                "is_pull_model": True,
                "language": language,
                "theme.english": urllib.parse.unquote(theme),
                "type": exp_name.lower(),
            })

        # expName on its own must still narrow by content type. The legacy branch
        # above only applied `type` when language+theme were also supplied, so a
        # plain ?expName=song returned stories and quizzes too.
        if exp_name and exp_name.lower() != "quiz" and "type" not in q:
            q["type"] = exp_name.lower()

        if after_creation_time is not None:
            q["creation_time"] = {"$lte": after_creation_time}

        if search:
            escaped = re.escape(search)
            regex = {"$regex": escaped, "$options": "i"}
            q["$or"] = [
                {"title.english": regex},
                {"title.local": regex},
            ]

        docs = await self._col.find(q).sort("creation_time", -1).to_list(length=limit)
        return [AudioContent.from_doc(d) for d in docs]

    async def find_themes(
        self,
        tenant_id: str,
        language: str,
        school_id: str | None = None,
    ) -> list[dict]:
        q = self._tenant_query(tenant_id, school_id)
        q.update({"language": language, "is_pull_model": True})
        return await self._col.find(q).sort("_id", -1).to_list(length=None)

    async def find_by_ids(
        self,
        content_ids: list[str],
        tenant_id: str,
        school_id: str | None = None,
    ) -> list[AudioContent]:
        q = {**self._tenant_query(tenant_id, school_id), "_id": {"$in": content_ids}}
        docs = await self._col.find(q).to_list(length=None)
        return [AudioContent.from_doc(d) for d in docs]

    async def find_matching_keywords(
        self,
        regex: Any,
        tenant_id: str,
        school_id: str | None = None,
        limit: int = 10,
    ) -> list[dict]:
        """Tenant-scoped keyword search across title/type/theme — used by the Seeds
        AI assistant to ground LLM prompts (mirrors JS fetchContextFromDB, scoped to
        the caller's tenant/school so cross-tenant content never leaks into the LLM
        prompt).
        """
        query = {
            **self._tenant_query(tenant_id, school_id),
            "$or": [
                {"title.english": regex},
                {"title.local": regex},
                {"type": regex},
                {"theme.english": regex},
            ],
        }
        return await self._col.find(
            query, {"_id": 1, "title": 1, "type": 1, "language": 1, "theme": 1}
        ).limit(limit).to_list(length=limit)

    async def find_by_class(self, content_ids: list[str]) -> list[Content]:
        """Fetch content items by IDs for Classroom hydration (no tenant scope)."""
        docs = await self._col.find({"_id": {"$in": [ObjectId(i) for i in content_ids]}}).to_list(length=None)
        return [Content.from_mongo(d) for d in docs]

    async def find_by_tenant(
        self,
        tenant_id: str,
        include_deleted: bool = False,
    ) -> list[Content]:
        """Return all content for a tenant as Content model objects."""
        q = self._tenant_query(tenant_id, school_id=None, include_deleted=include_deleted)
        docs = await self._col.find(q).to_list(length=None)
        return [Content.from_mongo(d) for d in docs]

    async def create(self, content: Any) -> Content:
        """Insert a ContentCreate DTO and return the resulting Content model."""
        import time as _time
        doc = content.model_dump() if hasattr(content, "model_dump") else dict(content)
        doc.setdefault("creation_time", int(_time.time()))
        if doc.get("tenant_id"):
            doc["tenant_id"] = _oid(doc["tenant_id"])
        if doc.get("school_id"):
            doc["school_id"] = _oid(doc["school_id"])
        await self._col.insert_one(doc)
        doc["_id"] = str(doc["_id"])
        return Content.from_mongo(doc)

    async def insert_raw(self, doc: dict) -> str:
        """Insert a raw content document, coercing tenant_id/school_id/created_by to ObjectId."""
        if doc.get("tenant_id"):
            doc["tenant_id"] = _oid(doc["tenant_id"])
        if doc.get("school_id"):
            doc["school_id"] = _oid(doc["school_id"])
        if doc.get("created_by"):
            doc["created_by"] = _oid(doc["created_by"])
        await self._col.insert_one(doc)
        return str(doc["_id"])

    async def update_by_id_and_tenant(
        self,
        content_id: str,
        tenant_id: str,
        updates: dict,
        school_id: str | None = None,
    ) -> AudioContent | None:
        q = {**self._tenant_query(tenant_id, school_id, strict=True), "_id": content_id}
        updates["updated_at"] = datetime.now(UTC)
        doc = await self._col.find_one_and_update(q, {"$set": updates}, return_document=True)
        return AudioContent.from_doc(doc) if doc else None

    async def soft_delete_by_id_and_tenant(
        self,
        content_id: str,
        tenant_id: str,
        school_id: str | None = None,
    ) -> int:
        q = {**self._tenant_query(tenant_id, school_id, strict=True), "_id": content_id}
        result = await self._col.update_one(
            q, {"$set": {"is_deleted": True, "updated_at": datetime.now(UTC)}}
        )
        return result.matched_count

    async def save_processed(self, content_id: str, fields: dict) -> None:
        await self._col.update_one({"_id": content_id}, {"$set": fields})
