"""Content job repository — Motor async data access for the 'content_jobs' collection."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.repositories.base_repository import BaseRepository

_ACTIVE_STATUSES = ["running", "failed", "claimed"]


class ContentJobRepository(BaseRepository):
    """Async Motor repository for the 'content_jobs' collection."""

    COLLECTION = "content_jobs"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def create(self, content_id: str) -> str:
        """Insert a pending job for *content_id* and return its string _id."""
        job_doc: dict[str, Any] = {
            "_id": str(uuid.uuid4()),
            "content_id": content_id,
            "status": "pending",
            "created_at": datetime.now(UTC),
        }
        await self._col.insert_one(job_doc)
        return job_doc["_id"]

    async def find_by_id(self, job_id: str) -> dict[str, Any] | None:
        """Return the job document for *job_id*, or None."""
        return await self._col.find_one({"_id": job_id})

    async def find_active(self) -> list[dict[str, Any]]:
        """Return all running, claimed, or failed jobs sorted by created_at desc."""
        cursor = self._col.find({"status": {"$in": _ACTIVE_STATUSES}}).sort("created_at", -1)
        return await cursor.to_list(length=None)

    async def claim_next_pending(self) -> dict[str, Any] | None:
        """Atomically move one pending job to claimed. Returns the job doc or None."""
        return await self._col.find_one_and_update(
            {"status": "pending"},
            {"$set": {"status": "claimed", "claimed_at": datetime.now(UTC)}},
            return_document=True,
        )

    async def mark_running(self, job_id: str) -> None:
        """Transition job to running state."""
        await self._col.update_one(
            {"_id": job_id},
            {"$set": {"status": "running", "started_at": datetime.now(UTC)}},
        )

    async def mark_completed(self, job_id: str) -> None:
        """Transition job to completed state."""
        await self._col.update_one(
            {"_id": job_id},
            {"$set": {"status": "completed", "completed_at": datetime.now(UTC)}},
        )

    async def mark_failed(self, job_id: str, reason: str) -> None:
        """Dead-letter job with failure reason."""
        await self._col.update_one(
            {"_id": job_id},
            {"$set": {"status": "failed", "reason": reason, "failed_at": datetime.now(UTC)}},
        )
