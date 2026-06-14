"""User repository — Motor async data access for the users collection."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import User, UserCreate


class UserRepository:
    """Async Motor repository for the 'users' collection.

    Never raises on not-found; callers decide to raise HTTPException / NotFoundError.
    """

    COLLECTION = "users"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @staticmethod
    def _to_id(id_str: str) -> ObjectId | str:
        """Convert a str to ObjectId when valid, otherwise return as-is."""
        try:
            return ObjectId(id_str)
        except Exception:
            return id_str

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------
    async def find_by_id(self, id: str) -> Optional[User]:
        """Find a user by their MongoDB _id."""
        doc = await self._col.find_one({"_id": self._to_id(id)})
        return User.from_mongo(doc) if doc else None

    async def find_by_email(self, email: str) -> Optional[User]:
        """Find a user by their email address."""
        doc = await self._col.find_one({"email": email})
        return User.from_mongo(doc) if doc else None

    async def find_by_phone(self, phone: str) -> Optional[User]:
        """Find a user by their phone number."""
        doc = await self._col.find_one({"phone": phone})
        return User.from_mongo(doc) if doc else None

    async def find_by_firebase_uid(self, uid: str) -> Optional[User]:
        """Find a user by their Firebase UID."""
        doc = await self._col.find_one({"firebase_uid": uid})
        return User.from_mongo(doc) if doc else None

    async def find_all_by_tenant(self, tenant_id: str) -> List[User]:
        """Return all users belonging to a tenant."""
        cursor = self._col.find({"tenant_id": tenant_id})
        docs = await cursor.to_list(length=None)
        return [User.from_mongo(d) for d in docs]

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------
    async def create(self, user: UserCreate) -> User:
        """Insert a new user and return the persisted document."""
        now = datetime.now(timezone.utc)
        doc = user.model_dump(by_alias=False)
        doc["created_at"] = now
        doc["updated_at"] = now
        result = await self._col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return User.from_mongo(doc)

    async def update(self, id: str, updates: dict) -> Optional[User]:
        """Apply a partial update dict and return the updated document.

        Returns None when the document is not found.
        """
        updates["updated_at"] = datetime.now(timezone.utc)
        result = await self._col.find_one_and_update(
            {"_id": self._to_id(id)},
            {"$set": updates},
            return_document=True,
        )
        return User.from_mongo(result) if result else None

    async def delete(self, id: str) -> bool:
        """Delete a user by _id. Returns True when a document was deleted."""
        result = await self._col.delete_one({"_id": self._to_id(id)})
        return result.deleted_count > 0
