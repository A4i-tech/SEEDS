"""Project repository — PyMongo async data access for the projects collection.

Projects are the top-level grouping for onboarded websites (ticket #436).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository


class ProjectRepository(BaseRepository):
    COLLECTION = "projects"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def create(
        self,
        name: str,
        description: str = "",
        source_language: str = "English",
        status: str = "Active",
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "name": name,
            "description": description,
            "sourceLanguage": source_language,
            "status": status,
            "createdAt": now,
            "updatedAt": now,
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_id(self, project_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": self._to_id(project_id)})

    async def find_all(self) -> list[dict[str, Any]]:
        return await self._col.find({}).to_list(length=None)

    async def update(self, project_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        fields = {**fields, "updatedAt": datetime.now(UTC)}
        await self._col.update_one({"_id": self._to_id(project_id)}, {"$set": fields})
        return await self.find_by_id(project_id)

    async def delete(self, project_id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(project_id)})
        return result.deleted_count > 0

    async def count(self) -> int:
        return await self._col.count_documents({})
