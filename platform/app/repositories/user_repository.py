"""User repository — Motor async data access for the users collection."""
from __future__ import annotations

from datetime import UTC, datetime

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import User, UserCreate
from app.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository):
    """Async Motor repository for the 'users' collection.

    Never raises on not-found; callers decide to raise HTTPException / NotFoundError.
    """

    COLLECTION = "users"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------
    async def find_by_id(self, id: str) -> User | None:
        """Find a user by their MongoDB _id."""
        doc = await self._col.find_one({"_id": self._to_id(id)})
        return User.from_mongo(doc) if doc else None

    async def find_by_email(self, email: str) -> User | None:
        """Find a user by their email address."""
        doc = await self._col.find_one({"email": email})
        return User.from_mongo(doc) if doc else None

    async def find_by_phone(self, phone: str) -> User | None:
        """Find a user by their phone number."""
        doc = await self._col.find_one({"phone": phone})
        return User.from_mongo(doc) if doc else None

    async def find_by_firebase_uid(self, uid: str) -> User | None:
        """Find a user by their Firebase UID."""
        doc = await self._col.find_one({"firebase_uid": uid})
        return User.from_mongo(doc) if doc else None

    async def find_all_by_tenant(self, tenant_id: str) -> list[User]:
        """Return all users belonging to a tenant."""
        cursor = self._col.find({"tenant_id": tenant_id})
        docs = await cursor.to_list(length=None)
        return [User.from_mongo(d) for d in docs]

    async def count_by_school_and_role(self, school_id: str, role: str) -> int:
        """Return count of users with the given school_id and role."""
        return await self._col.count_documents({"school_id": school_id, "role": role})

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------
    async def create(self, user: UserCreate) -> User:
        """Insert a new user and return the persisted document."""
        now = datetime.now(UTC)
        doc = user.model_dump(by_alias=False)
        doc["created_at"] = now
        doc["updated_at"] = now
        result = await self._col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return User.from_mongo(doc)

    async def update(self, id: str, updates: dict) -> User | None:
        """Apply a partial update dict and return the updated document.

        Returns None when the document is not found.
        """
        updates["updated_at"] = datetime.now(UTC)
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
