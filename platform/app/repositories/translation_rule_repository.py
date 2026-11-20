from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository


class TranslationRuleRepository(BaseRepository):
    COLLECTION = "translation_rules"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        await db[cls.COLLECTION].create_index(
            [("site_id", 1), ("kind", 1), ("text", 1), ("lang", 1)], unique=True
        )

    async def find_by_site(self, site_id: str) -> list[dict[str, Any]]:
        return await self._col.find({"site_id": site_id}).to_list(length=None)

    async def find_by_id(self, rule_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": self._to_id(rule_id)})

    async def find_same(self, site_id: str, kind: str, text: str, lang: str) -> dict[str, Any] | None:
        return await self._col.find_one({"site_id": site_id, "kind": kind, "text": text, "lang": lang})

    async def count_by_site(self, site_id: str) -> int:
        return await self._col.count_documents({"site_id": site_id})

    async def insert(self, site_id: str, fields: dict[str, Any], updated_by: str) -> dict[str, Any]:
        doc = {"site_id": site_id, **fields, "updated_by": updated_by, "updated_at": datetime.now(UTC)}
        result = await self._col.insert_one(doc)
        return {**doc, "_id": result.inserted_id}

    async def replace(self, rule_id: str, fields: dict[str, Any], updated_by: str) -> None:
        await self._col.update_one(
            {"_id": self._to_id(rule_id)},
            {"$set": {**fields, "updated_by": updated_by, "updated_at": datetime.now(UTC)}},
        )

    async def delete(self, rule_id: str) -> None:
        await self._col.delete_one({"_id": self._to_id(rule_id)})
