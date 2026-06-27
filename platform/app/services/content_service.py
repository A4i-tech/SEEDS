"""Content service — business logic and data access for content/quiz/job collections."""

from __future__ import annotations

from typing import Any

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.dependencies import get_db
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.quiz_repository import QuizRepository


class ContentService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:
        self._db = db
        self._quiz_repo = QuizRepository(db)
        self._job_repo = ContentJobRepository(db)

    async def enqueue_content_job(self, content_id: str) -> str:
        return await self._job_repo.create(content_id)

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        return await self._job_repo.find_by_id(job_id)

    async def list_active_jobs(self) -> list[dict[str, Any]]:
        return await self._job_repo.find_active()

    async def get_themes(self, query: dict[str, Any]) -> list[dict[str, Any]]:
        cursor = self._db["contentsV3"].find(query).sort("_id", -1)
        return await cursor.to_list(length=None)

    async def fetch_contents(
        self, query: dict[str, Any], limit: int | None = None
    ) -> list[dict[str, Any]]:
        cursor = self._db["contentsV3"].find(query).sort("creation_time", -1)
        return await cursor.to_list(length=limit)

    async def fetch_quizzes(
        self, query: dict[str, Any], limit: int | None = None
    ) -> list[dict[str, Any]]:
        return await self._quiz_repo.find_by_query(query, limit=limit)

    async def get_content_doc(self, query: dict[str, Any]) -> dict[str, Any] | None:
        return await self._db["contentsV3"].find_one(query)

    async def get_quiz_doc(self, query: dict[str, Any]) -> dict[str, Any] | None:
        return await self._quiz_repo.find_one_by_query(query)

    async def insert_content(self, doc: dict[str, Any]) -> str:
        result = await self._db["contentsV3"].insert_one(doc)
        return str(result.inserted_id)

    async def update_content_doc(
        self, filter_: dict[str, Any], update: dict[str, Any]
    ) -> dict[str, Any] | None:
        return await self._db["contentsV3"].find_one_and_update(
            filter_, {"$set": update}, return_document=True
        )

    async def soft_delete_content(self, filter_: dict[str, Any]) -> int:
        result = await self._db["contentsV3"].update_one(filter_, {"$set": {"isDeleted": True}})
        return result.matched_count

    async def soft_delete_quiz(self, filter_: dict[str, Any]) -> int:
        return await self._quiz_repo.soft_delete(filter_)

    async def insert_quiz(self, doc: dict[str, Any]) -> str:
        return await self._quiz_repo.insert(doc)


def get_content_service(db: AsyncIOMotorDatabase[Any] = Depends(get_db)) -> ContentService:
    return ContentService(db)
