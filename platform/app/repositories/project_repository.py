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
        tenant_id: str,
        name: str,
        description: str = "",
        source_language: str = "English",
        status: str = "Active",
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "tenant_id": tenant_id,
            "name": name,
            "description": description,
            "source_language": source_language,
            "status": status,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_id_and_tenant(self, project_id: str, tenant_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": self._to_id(project_id), "tenant_id": tenant_id})

    async def find_all_by_tenant(self, tenant_id: str) -> list[dict[str, Any]]:
        return await self._col.find({"tenant_id": tenant_id}).to_list(length=None)

    async def update(self, project_id: str, tenant_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        fields = {**fields, "updated_at": datetime.now(UTC)}
        await self._col.update_one(
            {"_id": self._to_id(project_id), "tenant_id": tenant_id}, {"$set": fields}
        )
        return await self.find_by_id_and_tenant(project_id, tenant_id)

    async def delete(self, project_id: str, tenant_id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(project_id), "tenant_id": tenant_id})
        return result.deleted_count > 0

    async def count(self) -> int:
        return await self._col.count_documents({})
