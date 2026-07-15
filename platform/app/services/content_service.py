"""Content service — business logic for content/quiz/job operations.

Accepts typed params from controllers; delegates all DB access to repositories.
No raw query dicts cross the service boundary.
"""

from __future__ import annotations

import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.requests.content_requests import (
    ContentCreate,
    ContentCreateRequest,
    ContentUpdateRequest,
    QuizCreate,
    QuizCreateRequest,
)
from app.platform.auth.dependencies import get_db
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository
from app.repositories.quiz_repository import QuizRepository

logger = logging.getLogger(__name__)


class ContentService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:
        self._content_repo = ContentRepository(db)
        self._quiz_repo = QuizRepository(db)
        self._job_repo = ContentJobRepository(db)

    # ------------------------------------------------------------------
    # Jobs
    # ------------------------------------------------------------------

    async def enqueue_content_job(self, content_id: str) -> str:
        return await self._job_repo.create(content_id)

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        return await self._job_repo.find_by_id(job_id)

    async def list_active_jobs(self) -> list[dict[str, Any]]:
        return await self._job_repo.find_active()

    # ------------------------------------------------------------------
    # Content reads
    # ------------------------------------------------------------------

    async def get_themes(
        self,
        tenant_id: str,
        language: str,
        school_id: str | None = None,
    ) -> list[dict[str, Any]]:
        return await self._content_repo.find_themes(tenant_id, language, school_id)

    async def list_content(
        self,
        tenant_id: str,
        school_id: str | None,
        language: str | None,
        theme: str | None,
        exp_name: str | None,
        only_teacher_app: bool,
        cursor: str | None,
        limit: int,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        """Return (content_docs, quiz_docs) for paginated list, each of length limit+1.

        Callers use len > limit to determine hasMore and slice to limit.
        """
        after_ct = _parse_cursor(cursor)
        fetch_limit = limit + 1

        fetch_content = not (exp_name and exp_name.lower() == "quiz")
        fetch_quizzes = not (exp_name and exp_name.lower() not in (None, "quiz"))

        # When language+theme+expName all set, only one collection is relevant
        if language and theme and exp_name:
            if exp_name.lower() == "quiz":
                fetch_content = False
            else:
                fetch_quizzes = False

        contents = (
            await self._content_repo.list_paginated(
                tenant_id, school_id, language, theme, exp_name,
                only_teacher_app, after_ct, fetch_limit,
            )
            if fetch_content else []
        )
        quizzes = (
            await self._quiz_repo.list_paginated(
                tenant_id, school_id, language, theme, exp_name,
                only_teacher_app, after_ct, fetch_limit,
            )
            if fetch_quizzes else []
        )
        return contents, quizzes

    async def list_content_by_ids(
        self,
        content_ids: list[str],
        tenant_id: str,
        school_id: str | None,
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        contents = await self._content_repo.find_by_ids(content_ids, tenant_id, school_id)
        quizzes = await self._quiz_repo.find_by_ids(content_ids, tenant_id, school_id)
        return contents, quizzes

    async def get_content_by_id(
        self,
        content_id: str,
        tenant_id: str,
        school_id: str | None,
    ) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
        """Return (content_doc, quiz_doc) — at most one is non-None."""
        doc = await self._content_repo.find_by_id_and_tenant(content_id, tenant_id, school_id)
        if doc:
            return doc, None
        quiz = await self._quiz_repo.find_by_id_and_tenant(content_id, tenant_id, school_id)
        return None, quiz

    # ------------------------------------------------------------------
    # Content writes
    # ------------------------------------------------------------------

    async def create_content(
        self,
        body: ContentCreateRequest,
        tenant_id: str,
        user_id: str,
        school_id: str | None,
        override_id: str | None = None,
    ) -> str:
        for item in body.audio_content or []:
            au = item.get("audio_url", "")
            if au and not au.lower().endswith(".mp3"):
                raise ValueError("Only .mp3 audio files are allowed.")

        dto = ContentCreate(
            tenant_id=tenant_id,
            type=body.type,
            language=body.language,
            created_by=user_id,
            school_id=school_id,
            title=body.title,
            theme=body.theme,
            audio_content=body.audio_content or [],
            description=body.description or "",
            is_pull_model=body.is_pull_model or False,
            is_teacher_app=body.is_teacher_app or False,
            creation_time=int(time.time()),
        )
        doc: dict[str, Any] = dto.model_dump()
        doc["_id"] = override_id or str(uuid.uuid4())
        doc["created_at"] = datetime.now(UTC)
        doc["updated_at"] = datetime.now(UTC)
        return await self._content_repo.insert_raw(doc)

    async def update_content(
        self,
        body: ContentUpdateRequest,
        tenant_id: str,
        school_id: str | None,
        is_audio_uploaded: bool,
    ) -> dict[str, Any] | None:
        allowed = {"title", "theme", "description", "type", "language", "is_pull_model", "is_teacher_app"}
        body_dict = body.model_dump(exclude_unset=True)
        updates: dict[str, Any] = {k: v for k, v in body_dict.items() if k in allowed}

        if is_audio_uploaded:
            if "audio_content" in body.model_fields_set:
                for item in body.audio_content or []:
                    au = item.get("audio_url", "")
                    if au and not au.lower().endswith(".mp3"):
                        raise ValueError("Only .mp3 audio files are allowed.")
                updates["audio_content"] = body.audio_content
            updates["is_processed"] = False

        result = await self._content_repo.update_by_id_and_tenant(
            body.id, tenant_id, updates, school_id
        )
        if result:
            return result

        # Quiz lives in a separate collection; mirror delete_content's fallback.
        quiz_allowed = allowed | {
            "local_title", "local_theme", "positive_marks", "negative_marks",
            "questions", "options", "correct_answers",
        }
        quiz_updates = {k: v for k, v in body_dict.items() if k in quiz_allowed}
        return await self._quiz_repo.update_by_id_and_tenant(
            body.id, tenant_id, quiz_updates, school_id
        )

    async def delete_content(
        self,
        content_id: str,
        tenant_id: str,
        school_id: str | None,
    ) -> int:
        matched = await self._content_repo.soft_delete_by_id_and_tenant(
            content_id, tenant_id, school_id
        )
        if matched:
            return matched
        return await self._quiz_repo.soft_delete_by_id_and_tenant(
            content_id, tenant_id, school_id
        )

    # ------------------------------------------------------------------
    # Quiz writes
    # ------------------------------------------------------------------

    async def create_quiz(
        self,
        body: QuizCreateRequest,
        tenant_id: str,
        user_id: str,
        school_id: str | None,
        override_id: str | None = None,
    ) -> str:
        body_dict = body.model_dump(by_alias=True, exclude_unset=True)
        dto = QuizCreate(
            tenant_id=tenant_id,
            type=body.type,
            language=body.language,
            created_by=user_id,
            school_id=school_id,
            title=body_dict.get("title") or "",
            local_title=body_dict.get("localTitle") or "",
            theme=body_dict.get("theme") or "",
            local_theme=body_dict.get("localTheme") or "",
            positive_marks=body.positive_marks or 1.0,
            negative_marks=body.negative_marks or 0.0,
            questions=body.questions or [],
            options=body.options or [],
            correct_answers=body.correct_answers or [],
            creation_time=int(time.time()),
        )
        doc: dict[str, Any] = dto.model_dump()
        doc["_id"] = override_id or str(uuid.uuid4())
        return await self._quiz_repo.insert(doc)

    # ------------------------------------------------------------------
    # Low-level passthrough (used by content job consumer)
    # ------------------------------------------------------------------

    async def get_raw_content_by_id(self, content_id: str) -> dict[str, Any] | None:
        return await self._content_repo.find_raw_by_id(content_id)

    async def save_processed(self, content_id: str, fields: dict[str, Any]) -> None:
        await self._content_repo.save_processed(content_id, fields)


def _parse_cursor(cursor: str | None) -> int | None:
    """Extract creation_time int from cursor string '{creation_time}_{id}'.

    Returns None on malformed cursor (restarts pagination from beginning).
    """
    if not cursor:
        return None
    parts = cursor.split("_", 1)
    if len(parts) == 2:
        try:
            return int(parts[0])
        except ValueError:
            pass
    logger.warning("Malformed pagination cursor ignored: %r", cursor)
    return None


def get_content_service(db: AsyncIOMotorDatabase[Any] = Depends(get_db)) -> ContentService:
    return ContentService(db)
