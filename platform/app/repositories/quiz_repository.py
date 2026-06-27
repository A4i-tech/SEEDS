"""Quiz repository — Motor async data access for the 'quizdata' collection."""

from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.base_repository import BaseRepository


class QuizRepository(BaseRepository):
    """Async Motor repository for the 'quizData' collection."""

    COLLECTION = "quizData"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def find_by_query(self, query: dict, limit: int | None = None) -> list[dict]:
        """Return quiz docs matching *query*, sorted by creation_time desc."""
        cursor = self._col.find(query).sort("creation_time", -1)
        return await cursor.to_list(length=limit)

    async def find_one_by_query(self, query: dict) -> dict | None:
        """Return first quiz doc matching *query*, or None."""
        return await self._col.find_one(query)

    async def insert(self, doc: dict) -> str:
        """Insert *doc* and return its string _id."""
        result = await self._col.insert_one(doc)
        return str(result.inserted_id)

    async def soft_delete(self, filter_: dict) -> int:
        """Set isDeleted=True on docs matching *filter_*. Returns matched_count."""
        result = await self._col.update_one(filter_, {"$set": {"isDeleted": True}})
        return result.matched_count
