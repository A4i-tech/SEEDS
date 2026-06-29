"""School repository — schools live in the unified users collection with role='school'."""
from __future__ import annotations

from datetime import UTC, datetime

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.school import School, SchoolCreate
from app.repositories.base_repository import BaseRepository


def _to_oid(val: str | None) -> ObjectId | str | None:
    if val and ObjectId.is_valid(val):
        return ObjectId(val)
    return val


class SchoolRepository(BaseRepository):
    COLLECTION = "users"
    _ROLE = "school"
    _NO_PWD: dict = {"hashed_password": 0}

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def find_by_id(self, id: str) -> School | None:
        doc = await self._col.find_one({"_id": self._to_id(id), "role": self._ROLE}, self._NO_PWD)
        return School.from_mongo(doc) if doc else None

    async def find_by_id_and_tenant(self, id: str, tenant_id: str) -> School | None:
        doc = await self._col.find_one(
            {"_id": self._to_id(id), "role": self._ROLE, "tenant_id": _to_oid(tenant_id)},
            self._NO_PWD,
        )
        return School.from_mongo(doc) if doc else None

    async def find_by_email(self, email: str) -> School | None:
        # No projection — password required for auth
        doc = await self._col.find_one({"email": email, "role": self._ROLE})
        return School.from_mongo(doc) if doc else None

    async def find_all_by_tenant(self, tenant_id: str) -> list[School]:
        cursor = self._col.find(
            {"role": self._ROLE, "tenant_id": _to_oid(tenant_id)}, self._NO_PWD
        )
        docs = await cursor.to_list(length=None)
        return [School.from_mongo(d) for d in docs]

    async def find_active_by_tenant(self, tenant_id: str) -> list[School]:
        cursor = self._col.find(
            {"role": self._ROLE, "tenant_id": _to_oid(tenant_id), "is_active": True},
            self._NO_PWD,
        )
        docs = await cursor.to_list(length=None)
        return [School.from_mongo(d) for d in docs]

    async def create(self, school: SchoolCreate) -> School:
        now = datetime.now(UTC)
        doc = school.model_dump(by_alias=False)
        doc["role"] = self._ROLE
        doc["created_at"] = now
        doc["updated_at"] = now
        if ObjectId.is_valid(doc.get("tenant_id", "")):
            doc["tenant_id"] = ObjectId(doc["tenant_id"])
        result = await self._col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return School.from_mongo(doc)

    async def update(self, id: str, updates: dict) -> School | None:
        updates["updated_at"] = datetime.now(UTC)
        result = await self._col.find_one_and_update(
            {"_id": self._to_id(id), "role": self._ROLE},
            {"$set": updates},
            return_document=True,
            projection=self._NO_PWD,
        )
        return School.from_mongo(result) if result else None

    async def delete(self, id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(id), "role": self._ROLE})
        return result.deleted_count > 0
