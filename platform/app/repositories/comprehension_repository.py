"""Comprehension repository (ported from IVRv2 comprehension_repository.py).

Adapted to use Motor AsyncIOMotorDatabase directly rather than the IDatabase interface.
"""
from __future__ import annotations

from typing import Any, Dict, List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.base_repository import BaseRepository


class ComprehensionRepository(BaseRepository):
    """Repository for managing comprehension documents in the database."""

    COLLECTION = "comprehensions"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def get_all_comprehensions(self) -> List[Dict[str, Any]]:
        """Retrieve all comprehension documents from the database."""
        cursor = self._col.find({})
        docs = await cursor.to_list(length=None)
        for d in docs:
            if "_id" in d and isinstance(d["_id"], ObjectId):
                d["_id"] = str(d["_id"])
        return docs

    async def get_comprehension_by_id(self, comprehension_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a single comprehension document by its ID."""
        doc = await self._col.find_one({"_id": self._to_id(comprehension_id)})
        if doc and isinstance(doc.get("_id"), ObjectId):
            doc["_id"] = str(doc["_id"])
        return doc

    async def create_comprehension(self, doc: Dict[str, Any]) -> Any:
        """Insert a new comprehension document into the database."""
        result = await self._col.insert_one(doc)
        return str(result.inserted_id)

    async def update_comprehension(
        self, comprehension_id: str, new_doc: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Update an existing comprehension document."""
        result = await self._col.find_one_and_update(
            {"_id": self._to_id(comprehension_id)},
            {"$set": new_doc},
            return_document=True,
        )
        if result and isinstance(result.get("_id"), ObjectId):
            result["_id"] = str(result["_id"])
        return result

    async def delete_comprehension(self, comprehension_id: str) -> bool:
        """Delete a comprehension document by its ID. Returns True if deleted."""
        result = await self._col.delete_one({"_id": self._to_id(comprehension_id)})
        return result.deleted_count > 0
