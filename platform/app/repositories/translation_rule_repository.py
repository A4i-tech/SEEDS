from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository

logger = logging.getLogger(__name__)

MAX_RULES = 20_000


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
        docs = await self._col.find({"site_id": site_id}).limit(MAX_RULES).to_list(length=MAX_RULES)
        if len(docs) == MAX_RULES:
            logger.warning("find_by_site hit MAX_RULES cap", extra={"site_id": site_id})
        return docs

    async def find_by_id(self, rule_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": self._to_id(rule_id)})

    async def insert(self, site_id: str, fields: dict[str, Any], updated_by: str) -> dict[str, Any]:
        doc = {"site_id": site_id, **fields, "updated_by": updated_by, "updated_at": datetime.now(UTC)}
        result = await self._col.insert_one(doc)
        return {**doc, "_id": result.inserted_id}

    async def update(self, rule_id: str, site_id: str, fields: dict[str, Any], updated_by: str) -> dict[str, Any]:
        return await self._col.find_one_and_update(
            {"_id": self._to_id(rule_id), "site_id": site_id},
            {"$set": {**fields, "updated_by": updated_by, "updated_at": datetime.now(UTC)}},
            return_document=ReturnDocument.AFTER,
        )

    async def delete(self, rule_id: str, site_id: str) -> None:
        await self._col.delete_one({"_id": self._to_id(rule_id), "site_id": site_id})
