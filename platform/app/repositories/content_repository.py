"""Content repository — Motor async data access for the content collections."""
from __future__ import annotations

from datetime import UTC, datetime

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.content import Content, ContentCreate
from app.repositories.base_repository import BaseRepository


class ContentRepository(BaseRepository):
    """Async Motor repository for the 'contentsV3' (and legacy 'contentsV2') collections."""

    COLLECTION = "contentsV3"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def find_by_id(self, id: str) -> Content | None:
        doc = await self._col.find_one({"_id": self._to_id(id)})
        return Content.from_mongo(doc) if doc else None

    async def find_by_tenant(self, tenant_id: str, include_deleted: bool = False) -> list[Content]:
        query: dict = {"tenant_id": tenant_id}
        if not include_deleted:
            query["is_deleted"] = {"$ne": True}
        cursor = self._col.find(query).sort("creation_time", -1)
        docs = await cursor.to_list(length=None)
        return [Content.from_mongo(d) for d in docs]

    async def find_by_class(self, content_ids: list[str]) -> list[Content]:
        """Fetch a batch of content items by their IDs (as used in Classroom.contentIds)."""
        cursor = self._col.find({"_id": {"$in": [self._to_id(i) for i in content_ids]}})
        docs = await cursor.to_list(length=None)
        return [Content.from_mongo(d) for d in docs]

    async def find_by_tenant_and_language(
        self, tenant_id: str, language: str, include_deleted: bool = False
    ) -> list[Content]:
        query: dict = {"tenant_id": tenant_id, "language": language}
        if not include_deleted:
            query["is_deleted"] = {"$ne": True}
        cursor = self._col.find(query)
        docs = await cursor.to_list(length=None)
        return [Content.from_mongo(d) for d in docs]

    async def create(self, content: ContentCreate) -> Content:
        now = datetime.now(UTC)
        doc = content.model_dump(by_alias=False)
        doc["created_at"] = now
        doc["updated_at"] = now
        result = await self._col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return Content.from_mongo(doc)

    async def update(self, id: str, updates: dict) -> Content | None:
        updates["updated_at"] = datetime.now(UTC)
        result = await self._col.find_one_and_update(
            {"_id": self._to_id(id)},
            {"$set": updates},
            return_document=True,
        )
        return Content.from_mongo(result) if result else None

    async def soft_delete(self, id: str) -> bool:
        result = await self._col.update_one(
            {"_id": self._to_id(id)},
            {"$set": {"is_deleted": True, "updated_at": datetime.now(UTC)}},
        )
        return result.modified_count > 0

    async def delete(self, id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(id)})
        return result.deleted_count > 0
