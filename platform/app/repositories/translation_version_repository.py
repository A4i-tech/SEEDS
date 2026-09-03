from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository


class TranslationVersionRepository(BaseRepository):
    COLLECTION = "translationVersions"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def add_version(
        self,
        translation_id: str,
        version: int,
        translations: dict[str, Any],
        approved_by: str,
        approved_at: datetime,
    ) -> dict[str, Any]:
        doc = {
            "translation_id": translation_id,
            "version": version,
            "translations": translations,
            "approved_by": approved_by,
            "approved_at": approved_at,
            "created_at": datetime.now(UTC),
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_translation(self, translation_id: str) -> list[dict[str, Any]]:
        return await self._col.find({"translation_id": translation_id}).sort("version", 1).to_list(length=None)
