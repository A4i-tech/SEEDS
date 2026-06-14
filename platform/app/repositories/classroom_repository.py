"""Classroom repository — Motor async data access for the classes collection."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.classroom import Classroom, ClassroomCreate


class ClassroomRepository:
    """Async Motor repository for the 'classes' collection."""

    COLLECTION = "classes"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    @staticmethod
    def _to_id(id_str: str) -> ObjectId | str:
        try:
            return ObjectId(id_str)
        except Exception:
            return id_str

    async def find_by_id(self, id: str) -> Optional[Classroom]:
        doc = await self._col.find_one({"_id": self._to_id(id)})
        return Classroom.from_mongo(doc) if doc else None

    async def find_by_school(self, school_id: str) -> List[Classroom]:
        cursor = self._col.find({"school_id": school_id})
        docs = await cursor.to_list(length=None)
        return [Classroom.from_mongo(d) for d in docs]

    async def find_by_teacher(self, teacher_id: str) -> List[Classroom]:
        cursor = self._col.find({"teacher": teacher_id})
        docs = await cursor.to_list(length=None)
        return [Classroom.from_mongo(d) for d in docs]

    async def create(self, classroom: ClassroomCreate) -> Classroom:
        now = datetime.now(timezone.utc)
        doc = classroom.model_dump(by_alias=False)
        doc["created_at"] = now
        doc["updated_at"] = now
        result = await self._col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return Classroom.from_mongo(doc)

    async def update(self, id: str, updates: dict) -> Optional[Classroom]:
        updates["updated_at"] = datetime.now(timezone.utc)
        result = await self._col.find_one_and_update(
            {"_id": self._to_id(id)},
            {"$set": updates},
            return_document=True,
        )
        return Classroom.from_mongo(result) if result else None

    async def delete(self, id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(id)})
        return result.deleted_count > 0
