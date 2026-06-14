"""School repository — Motor async data access for the schools collection."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.school import School, SchoolCreate


class SchoolRepository:
    """Async Motor repository for the 'schools' collection."""

    COLLECTION = "schools"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    @staticmethod
    def _to_id(id_str: str) -> ObjectId | str:
        try:
            return ObjectId(id_str)
        except Exception:
            return id_str

    async def find_by_id(self, id: str) -> Optional[School]:
        doc = await self._col.find_one({"_id": self._to_id(id)})
        return School.from_mongo(doc) if doc else None

    async def find_by_email(self, email: str) -> Optional[School]:
        doc = await self._col.find_one({"email": email})
        return School.from_mongo(doc) if doc else None

    async def find_all_by_tenant(self, tenant_id: str) -> List[School]:
        cursor = self._col.find({"tenant_id": tenant_id})
        docs = await cursor.to_list(length=None)
        return [School.from_mongo(d) for d in docs]

    async def find_active_by_tenant(self, tenant_id: str) -> List[School]:
        cursor = self._col.find({"tenant_id": tenant_id, "is_active": True})
        docs = await cursor.to_list(length=None)
        return [School.from_mongo(d) for d in docs]

    async def create(self, school: SchoolCreate) -> School:
        now = datetime.now(timezone.utc)
        doc = school.model_dump(by_alias=False)
        doc["created_at"] = now
        doc["updated_at"] = now
        result = await self._col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return School.from_mongo(doc)

    async def update(self, id: str, updates: dict) -> Optional[School]:
        updates["updated_at"] = datetime.now(timezone.utc)
        result = await self._col.find_one_and_update(
            {"_id": self._to_id(id)},
            {"$set": updates},
            return_document=True,
        )
        return School.from_mongo(result) if result else None

    async def delete(self, id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(id)})
        return result.deleted_count > 0
