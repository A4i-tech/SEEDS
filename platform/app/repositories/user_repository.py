"""User repository — PyMongo async data access for the users collection."""

from __future__ import annotations

from datetime import UTC, datetime

from pymongo.asynchronous.database import AsyncDatabase

from app.models.user import User, UserCreate
from app.repositories.base_repository import BaseRepository


class UserRepository(BaseRepository):
    """Async PyMongo repository for the 'users' collection.

    Never raises on not-found; callers decide to raise HTTPException / NotFoundError.
    """

    COLLECTION = "users"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    # ------------------------------------------------------------------
    # Read
    # ------------------------------------------------------------------
    async def find_by_id(self, id: str) -> User | None:
        """Find a user by their MongoDB _id."""
        doc = await self._col.find_one({"_id": self._to_oid(id)})
        return User.from_mongo(doc) if doc else None

    async def find_by_email(self, email: str) -> User | None:
        """Find a user by their email address."""
        doc = await self._col.find_one({"email": email})
        return User.from_mongo(doc) if doc else None

    async def find_by_email_and_role(self, email: str, role: str) -> User | None:
        """Find a user by email scoped to a specific role."""
        doc = await self._col.find_one({"email": email, "role": role})
        return User.from_mongo(doc) if doc else None

    async def find_by_phone(self, phone: str) -> User | None:
        """Find a user by their phone number."""
        doc = await self._col.find_one({"phone": phone})
        return User.from_mongo(doc) if doc else None

    async def find_by_school_id_and_tenant_id(self, school_id: str, tenant_id: str) -> User | None:
        """Find the school_admin user for a school_id and tenant_id.

        Filters by role="school_admin" — teachers/students share the same
        school_id/tenant_id as their school's admin, so without this filter
        find_one() can return any of them, not necessarily the admin.
        """
        doc = await self._col.find_one(
            {
                "school_id": self._to_oid(school_id),
                "tenant_id": self._to_oid(tenant_id),
                "role": "school_admin",
            }
        )
        return User.from_mongo(doc) if doc else None

    async def find_by_firebase_uid(self, uid: str) -> User | None:
        """Find a user by their Firebase UID."""
        doc = await self._col.find_one({"firebase_uid": uid})
        return User.from_mongo(doc) if doc else None

    async def find_all_by_tenant(self, tenant_id: str) -> list[User]:
        """Return all users belonging to a tenant."""
        # tolerant: teacher self-registration writes tenant_id as a raw string (test_fsm_utils.py::test_list_users_by_tenant relies on this round-trip).
        cursor = self._col.find({"tenant_id": self._to_id(tenant_id)})
        docs = await cursor.to_list(length=None)
        return [User.from_mongo(d) for d in docs]

    async def find_all_by_tenant_and_role(self, tenant_id: str, role: str) -> list[User]:
        cursor = self._col.find({"tenant_id": self._to_oid(tenant_id), "role": role})
        docs = await cursor.to_list(length=None)
        return [User.from_mongo(d) for d in docs]

    async def find_many_by_ids(self, ids: list[str]) -> list[User]:
        """Fetch multiple users by a list of _id strings in one query."""
        if not ids:
            return []
        object_ids = [self._to_oid(i) for i in ids]
        cursor = self._col.find({"_id": {"$in": object_ids}})
        docs = await cursor.to_list(length=None)
        return [User.from_mongo(d) for d in docs]

    async def find_by_school_and_role(self, school_id: str, role: str) -> list[User]:
        cursor = self._col.find({"school_id": self._to_oid(school_id), "role": role})
        docs = await cursor.to_list(length=None)
        return [User.from_mongo(d) for d in docs]

    async def count_by_school_and_role(self, school_id: str, role: str) -> int:
        return await self._col.count_documents({"school_id": self._to_oid(school_id), "role": role})

    # ------------------------------------------------------------------
    # Write
    # ------------------------------------------------------------------
    @classmethod
    def _coerce_refs(cls, doc: dict) -> dict:
        """Coerce tenant_id/school_id to ObjectId when present — matches how
        find_all_by_tenant's tolerant _to_id() read query filters on these fields."""
        for key in ("tenant_id", "school_id"):
            if doc.get(key) is not None:
                doc[key] = cls._to_id(doc[key])
        return doc

    async def create(self, user: UserCreate) -> User:
        """Insert a new user and return the persisted document."""
        now = datetime.now(UTC)
        doc = self._coerce_refs(user.model_dump(by_alias=False))
        doc["created_at"] = now
        doc["updated_at"] = now
        result = await self._col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return User.from_mongo(doc)

    async def update(self, id: str, updates: dict) -> User | None:
        """Apply a partial update dict and return the updated document.

        Returns None when the document is not found.
        """
        updates = self._coerce_refs(updates)
        updates["updated_at"] = datetime.now(UTC)
        result = await self._col.find_one_and_update(
            {"_id": self._to_oid(id)},
            {"$set": updates},
            return_document=True,
        )
        return User.from_mongo(result) if result else None

    async def delete(self, id: str) -> bool:
        """Delete a user by _id. Returns True when a document was deleted."""
        result = await self._col.delete_one({"_id": self._to_oid(id)})
        return result.deleted_count > 0
