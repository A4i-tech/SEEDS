"""Website repository — PyMongo async data access for the websites collection.

Each website belongs to one project and carries a unique siteId used by the
SDK snippet (ticket #436).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository


class WebsiteRepository(BaseRepository):
    COLLECTION = "websites"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        """Create unique indexes guarding against duplicate registrations.

        Called once at startup (see app/platform/lifespan.py). siteId is
        never updated after create() — immutable by construction, no code
        path writes to it post-insert.
        """
        col = db[cls.COLLECTION]
        await col.create_index("siteId", unique=True)
        await col.create_index("domain", unique=True)

    async def create(
        self,
        project_id: str,
        domain: str,
        site_id: str,
        name: str = "",
        status: str = "Active",
    ) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "projectId": project_id,
            "domain": domain,
            "siteId": site_id,
            "name": name,
            "status": status,
            "createdAt": now,
            "updatedAt": now,
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_id(self, website_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": self._to_id(website_id)})

    async def find_by_site_id(self, site_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"siteId": site_id})

    async def find_by_project(self, project_id: str) -> list[dict[str, Any]]:
        return await self._col.find({"projectId": project_id}).to_list(length=None)

    async def find_all(self) -> list[dict[str, Any]]:
        return await self._col.find({}).to_list(length=None)

    async def update(self, website_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        fields = {**fields, "updatedAt": datetime.now(UTC)}
        await self._col.update_one({"_id": self._to_id(website_id)}, {"$set": fields})
        return await self.find_by_id(website_id)

    async def delete(self, website_id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(website_id)})
        return result.deleted_count > 0

    async def count(self) -> int:
        return await self._col.count_documents({})
