"""Conference repository — Motor async data access for conference state documents."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.conference_state import ConferenceCallState
from app.repositories.base_repository import BaseRepository


class ConferenceOwnershipRepository:
    """Async Motor repository for the 'conferences' collection.

    Stores lightweight ownership metadata (created_by, tenant_id) used by
    auth dependencies to enforce conference ownership checks.
    """

    COLLECTION = "conferences"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:  # type: ignore[type-arg]
        self._col = db[self.COLLECTION]

    async def create(
        self,
        conf_id: str,
        created_by: str,
        tenant_id: str,
        teacher_phone: str,
    ) -> None:
        await self._col.insert_one({
            "conference_id": conf_id,
            "created_by": created_by,
            "tenant_id": tenant_id,
            "teacher_phone": teacher_phone,
            "created_at": datetime.now(UTC),
        })

    async def find_by_id(self, conf_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"conference_id": conf_id})


class ConferenceRepository(BaseRepository):
    """Async Motor repository for the 'conference_states' collection."""

    COLLECTION = "conferenceState"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def find_by_id(self, id: str) -> ConferenceCallState | None:
        doc = await self._col.find_one({"_id": self._to_id(id)})
        return ConferenceCallState.from_mongo(doc) if doc else None

    async def find_by_conference_id(self, conference_id: str) -> ConferenceCallState | None:
        doc = await self._col.find_one({"conference_id": conference_id})
        return ConferenceCallState.from_mongo(doc) if doc else None

    async def find_active_by_teacher(self, teacher_phone: str) -> ConferenceCallState | None:
        """Return the active (non-ended) conference for a teacher phone number."""
        doc = await self._col.find_one(
            {
                "teacher_phone_number": teacher_phone,
                "ended_at": None,
                "is_running": True,
            }
        )
        return ConferenceCallState.from_mongo(doc) if doc else None

    async def find_active_by_tenant(self, tenant_id: str) -> list[ConferenceCallState]:
        """Return all active conferences for a tenant."""
        cursor = self._col.find({"tenant_id": tenant_id, "ended_at": None, "is_running": True})
        docs = await cursor.to_list(length=None)
        return [ConferenceCallState.from_mongo(d) for d in docs]

    async def create(self, state: ConferenceCallState) -> ConferenceCallState:
        doc = state.model_dump(by_alias=True, exclude_none=False)
        if doc.get("_id") is None:
            doc.pop("_id", None)
        result = await self._col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return ConferenceCallState.from_mongo(doc)

    async def update_state(self, conference_id: str, updates: dict) -> ConferenceCallState | None:
        """Update a conference document identified by its Vonage conference_id."""
        result = await self._col.find_one_and_update(
            {"conference_id": conference_id},
            {"$set": updates},
            return_document=True,
        )
        return ConferenceCallState.from_mongo(result) if result else None

    async def end_conference(self, conference_id: str) -> ConferenceCallState | None:
        """Mark a conference as ended."""
        now_iso = datetime.now(UTC).isoformat()
        return await self.update_state(
            conference_id,
            {"is_running": False, "ended_at": now_iso},
        )

    async def delete(self, id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(id)})
        return result.deleted_count > 0
