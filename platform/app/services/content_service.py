"""Content service — business logic and data access for content/job collections."""
from __future__ import annotations

import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.responses.content import ContentResponse
from app.platform.auth.dependencies import get_db


class ContentService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:
        self._db = db

    async def enqueue_content_job(self, content_id: str) -> str:
        job_doc: dict = {
            "_id": str(uuid.uuid4()),
            "content_id": content_id,
            "status": "pending",
            "created_at": datetime.now(UTC),
        }
        await self._db["content_jobs"].insert_one(job_doc)
        return str(job_doc["_id"])

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        return await self._db["content_jobs"].find_one({"_id": job_id})

    async def list_active_jobs(self) -> list[dict[str, Any]]:
        cursor = self._db["content_jobs"].find(
            {"status": {"$in": ["running", "failed", "claimed"]}}
        ).sort("created_at", -1)
        return await cursor.to_list(length=None)

    async def get_themes(self, query: dict[str, Any]) -> list[dict[str, Any]]:
        cursor = self._db["contentsV3"].find(query).sort("_id", -1)
        return await cursor.to_list(length=None)

    async def fetch_contents(self, query: dict[str, Any], limit: int | None = None) -> list[dict[str, Any]]:
        cursor = self._db["contentsV3"].find(query).sort("creation_time", -1)
        return await cursor.to_list(length=limit)

    async def get_content_doc(self, query: dict[str, Any]) -> dict[str, Any] | None:
        return await self._db["contentsV3"].find_one(query)

    async def insert_content(self, doc: dict[str, Any]) -> str:
        result = await self._db["contentsV3"].insert_one(doc)
        return str(result.inserted_id)

    async def update_content_doc(
        self, filter_: dict[str, Any], update: dict[str, Any]
    ) -> ContentResponse | None:
        doc = await self._db["contentsV3"].find_one_and_update(
            filter_, {"$set": update}, return_document=True
        )
        return ContentResponse.model_validate(doc) if doc else None

    async def soft_delete_content(self, filter_: dict[str, Any]) -> int:
        result = await self._db["contentsV3"].update_one(filter_, {"$set": {"is_deleted": True}})
        return result.matched_count


def get_content_service(db: AsyncIOMotorDatabase[Any] = Depends(get_db)) -> ContentService:
    return ContentService(db)
