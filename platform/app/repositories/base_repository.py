"""Base repository — shared utilities for all PyMongo async repositories."""
from __future__ import annotations

from bson import ObjectId
from pymongo.asynchronous.collection import AsyncCollection


class BaseRepository:
    """Mixin providing common helpers for MongoDB document access."""

    @staticmethod
    def _to_id(id_str: str) -> ObjectId | str:
        """Coerce a string to ObjectId when valid, otherwise keep as str.

        IVR and content collections use plain-string _ids; user/school
        collections use ObjectId. This handles both transparently.
        """
        try:
            return ObjectId(id_str)
        except Exception:
            return id_str

    @classmethod
    def _ids_query(cls, ids: list[str]) -> dict:
        """$in match for a list of ids, coercing each to ObjectId when valid."""
        return {"$in": [cls._to_id(i) for i in ids]}

    @staticmethod
    async def _page_by_creation_time(
        col: AsyncCollection, query: dict, cursor: str, limit: int
    ) -> list[dict]:
        creation_time, _, last_id = cursor.partition("_")
        if cursor:
            query["$or"] = [
                {"creation_time": {"$lt": int(creation_time)}},
                {"creation_time": int(creation_time), "_id": {"$lt": ObjectId(last_id)}},
            ]
        return await col.find(query).sort([("creation_time", -1), ("_id", -1)]).to_list(length=limit)
