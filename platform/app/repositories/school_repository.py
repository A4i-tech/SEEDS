"""School repository — Motor async data access for the schools collection."""
from __future__ import annotations

from datetime import UTC, datetime

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.requests.school_requests import SchoolCreate
from app.models.school import School
from app.repositories.base_repository import BaseRepository


class SchoolRepository(BaseRepository):
    """Async Motor repository for the 'schools' collection."""

    COLLECTION = "schools"
    # Exclude password from all reads except find_by_email (used for auth)
    _NO_PWD: dict = {"password": 0}

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def find_by_id(self, id: str) -> School | None:
        doc = await self._col.find_one({"_id": self._to_id(id)}, self._NO_PWD)
        return School.from_mongo(doc) if doc else None

    async def find_by_id_and_tenant(self, id: str, tenant_id: str) -> School | None:
        doc = await self._col.find_one(
            {"_id": self._to_id(id), "tenantId": self._to_id(tenant_id)}, self._NO_PWD
        )
        return School.from_mongo(doc) if doc else None

    async def find_by_email(self, email: str) -> School | None:
        # No projection — password required for auth (school_admin_login)
        doc = await self._col.find_one({"email": email})
        return School.from_mongo(doc) if doc else None

    async def find_all_by_tenant(self, tenant_id: str) -> list[School]:
        cursor = self._col.find({"tenantId": self._to_id(tenant_id)}, self._NO_PWD)
        docs = await cursor.to_list(length=None)
        return [School.from_mongo(d) for d in docs]

    async def find_active_by_tenant(self, tenant_id: str) -> list[School]:
        cursor = self._col.find({"tenantId": self._to_id(tenant_id), "isActive": True}, self._NO_PWD)
        docs = await cursor.to_list(length=None)
        return [School.from_mongo(d) for d in docs]

    async def create(self, school: SchoolCreate) -> School:
        now = datetime.now(UTC)
        doc = school.model_dump()
        doc["createdAt"] = now
        doc["updatedAt"] = now
        doc["tenantId"] = ObjectId(doc["tenantId"])
        result = await self._col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return School.from_mongo(doc)

    async def update(self, id: str, updates: dict) -> School | None:
        updates["updatedAt"] = datetime.now(UTC)
        result = await self._col.find_one_and_update(
            {"_id": self._to_id(id)},
            {"$set": updates},
            return_document=True,
            projection=self._NO_PWD,
        )
        return School.from_mongo(result) if result else None

    async def delete(self, id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(id)})
        return result.deleted_count > 0
