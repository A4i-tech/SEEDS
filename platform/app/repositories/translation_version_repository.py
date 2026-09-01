"""Translation version history — PyMongo async data access for translation_versions.

Kept in its own append-only collection so the runtime translations documents
stay small; history is never modified or overwritten (ticket #436, Phase H).
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository


class TranslationVersionRepository(BaseRepository):
    COLLECTION = "translation_versions"

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
            "translationId": translation_id,
            "version": version,
            "translations": translations,
            "approvedBy": approved_by,
            "approvedAt": approved_at,
            "createdAt": datetime.now(UTC),
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_translation(self, translation_id: str) -> list[dict[str, Any]]:
        return await self._col.find({"translationId": translation_id}).sort("version", 1).to_list(length=None)
