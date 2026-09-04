from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository


class LanguageRepository(BaseRepository):
    COLLECTION = "languages"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        await db[cls.COLLECTION].create_index("code", unique=True)

    async def create(self, name: str, code: str, direction: str, enabled: bool) -> dict[str, Any]:
        now = datetime.now(UTC)
        doc = {
            "name": name,
            "code": code,
            "direction": direction,
            "enabled": enabled,
            "created_at": now,
            "updated_at": now,
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_all(self, enabled_only: bool = False) -> list[dict[str, Any]]:
        query: dict[str, Any] = {"enabled": True} if enabled_only else {}
        return await self._col.find(query).to_list(length=None)

    async def find_by_id(self, language_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": self._to_id(language_id)})

    async def update(self, language_id: str, fields: dict[str, Any]) -> None:
        fields["updated_at"] = datetime.now(UTC)
        await self._col.update_one({"_id": self._to_id(language_id)}, {"$set": fields})

    async def delete(self, language_id: str) -> None:
        await self._col.delete_one({"_id": self._to_id(language_id)})
