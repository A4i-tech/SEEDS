"""Content service — business logic and data access for content/quiz/job collections."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.dependencies import get_db


class ContentService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:
        self._db = db

    async def enqueue_content_job(self, content_id: str) -> str:
        """Insert a pending content job document and return its string _id."""
        job_doc: dict = {
            "_id": str(uuid.uuid4()),
            "content_id": content_id,
            "status": "pending",
            "created_at": datetime.now(timezone.utc),
        }
        await self._db["content_jobs"].insert_one(job_doc)
        return str(job_doc["_id"])

    async def get_job(self, job_id: str) -> Optional[dict[str, Any]]:
        return await self._db["content_jobs"].find_one({"_id": job_id})

    async def list_active_jobs(self) -> list[dict[str, Any]]:
        cursor = self._db["content_jobs"].find(
            {"status": {"$in": ["running", "failed", "claimed"]}}
        ).sort("created_at", -1)
        return await cursor.to_list(length=None)

    async def get_themes(self, query: dict[str, Any]) -> list[dict[str, Any]]:
        cursor = self._db["contentsV3"].find(query).sort("_id", -1)
        return await cursor.to_list(length=None)

    async def fetch_contents(self, query: dict[str, Any]) -> list[dict[str, Any]]:
        return await self._db["contentsV3"].find(query).sort("creation_time", -1).to_list(length=None)

    async def fetch_quizzes(self, query: dict[str, Any]) -> list[dict[str, Any]]:
        return await self._db["quizdata"].find(query).sort("creation_time", -1).to_list(length=None)

    async def get_content_doc(self, query: dict[str, Any]) -> Optional[dict[str, Any]]:
        return await self._db["contentsV3"].find_one(query)

    async def get_quiz_doc(self, query: dict[str, Any]) -> Optional[dict[str, Any]]:
        return await self._db["quizdata"].find_one(query)

    async def insert_content(self, doc: dict[str, Any]) -> str:
        result = await self._db["contentsV3"].insert_one(doc)
        return str(result.inserted_id)

    async def update_content_doc(
        self, filter_: dict[str, Any], update: dict[str, Any]
    ) -> Optional[dict[str, Any]]:
        return await self._db["contentsV3"].find_one_and_update(
            filter_, {"$set": update}, return_document=True
        )

    async def soft_delete_content(self, filter_: dict[str, Any]) -> int:
        result = await self._db["contentsV3"].update_one(filter_, {"$set": {"isDeleted": True}})
        return result.matched_count

    async def soft_delete_quiz(self, filter_: dict[str, Any]) -> int:
        result = await self._db["quizdata"].update_one(filter_, {"$set": {"isDeleted": True}})
        return result.matched_count

    async def insert_quiz(self, doc: dict[str, Any]) -> str:
        result = await self._db["quizdata"].insert_one(doc)
        return str(result.inserted_id)


def get_content_service(db: AsyncIOMotorDatabase[Any] = Depends(get_db)) -> ContentService:
    return ContentService(db)
