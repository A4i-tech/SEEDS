from __future__ import annotations

from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository


class GlossaryRepository(BaseRepository):
    COLLECTION = "glossary"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def add_term(self, source_term: str, target_lang: str, translated_term: str) -> dict[str, Any]:
        doc = {"sourceTerm": source_term, "targetLang": target_lang, "translatedTerm": translated_term}
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def find_by_lang(self, target_lang: str) -> list[dict[str, Any]]:
        return await self._col.find({"targetLang": target_lang}).to_list(length=None)

    async def find_all(self) -> list[dict[str, Any]]:
        return await self._col.find({}).to_list(length=None)

    async def delete(self, term_id: str) -> None:
        await self._col.delete_one({"_id": self._to_id(term_id)})
