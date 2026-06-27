"""Content repository — Motor async data access for the content collections."""
from __future__ import annotations

from datetime import UTC, datetime

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.content import Content
from app.models.requests.content_requests import ContentCreate
from app.repositories.base_repository import BaseRepository


class ContentRepository(BaseRepository):
    """Async Motor repository for the 'contentsV3' (and legacy 'contentsV2') collections."""

    COLLECTION = "contentsV3"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def find_by_id(self, id: str) -> Content | None:
        doc = await self._col.find_one({"_id": id})
        return Content.from_mongo(doc) if doc else None

    async def find_by_tenant(self, tenant_id: str, include_deleted: bool = False) -> list[Content]:
        query: dict = {"tenantId": tenant_id}
        if not include_deleted:
            query["isDeleted"] = {"$ne": True}
        cursor = self._col.find(query).sort("creation_time", -1)
        docs = await cursor.to_list(length=None)
        return [Content.from_mongo(d) for d in docs]

    async def find_by_class(self, content_ids: list[str]) -> list[Content]:
        """Fetch a batch of content items by their IDs (as used in Classroom.contentIds)."""
        cursor = self._col.find({"_id": {"$in": content_ids}})
        docs = await cursor.to_list(length=None)
        return [Content.from_mongo(d) for d in docs]

    async def find_by_tenant_and_language(
        self, tenant_id: str, language: str, include_deleted: bool = False
    ) -> list[Content]:
        query: dict = {"tenantId": tenant_id, "language": language}
        if not include_deleted:
            query["isDeleted"] = {"$ne": True}
        cursor = self._col.find(query)
        docs = await cursor.to_list(length=None)
        return [Content.from_mongo(d) for d in docs]

    async def create(self, content: ContentCreate) -> Content:
        import uuid
        now = datetime.now(UTC)
        doc = content.model_dump()
        doc["_id"] = str(uuid.uuid4())
        doc["createdAt"] = now
        doc["updatedAt"] = now
        await self._col.insert_one(doc)
        return Content.from_mongo(doc)

    async def update(self, id: str, updates: dict) -> Content | None:
        updates["updatedAt"] = datetime.now(UTC)
        result = await self._col.find_one_and_update(
            {"_id": id},
            {"$set": updates},
            return_document=True,
        )
        return Content.from_mongo(result) if result else None

    async def soft_delete(self, id: str) -> bool:
        result = await self._col.update_one(
            {"_id": id},
            {"$set": {"isDeleted": True, "updatedAt": datetime.now(UTC)}},
        )
        return result.modified_count > 0

    async def delete(self, id: str) -> bool:
        result = await self._col.delete_one({"_id": id})
        return result.deleted_count > 0

    async def find_raw_by_id(self, content_id: str) -> dict | None:
        """Return the raw MongoDB document for *content_id*, or None."""
        return await self._col.find_one({"_id": content_id})

    async def save_processed(self, content_id: str, fields: dict) -> None:
        """Apply *fields* as a $set update on the content document."""
        await self._col.update_one({"_id": content_id}, {"$set": fields})
