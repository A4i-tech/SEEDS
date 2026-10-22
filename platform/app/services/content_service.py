
from __future__ import annotations

import logging
import re
import time
from datetime import UTC, datetime
from typing import Any, BinaryIO

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.content_requests import (
    ContentCreate,
    ContentCreateRequest,
    ContentUpdateRequest,
    QuizCreate,
    QuizCreateRequest,
)
from app.models.responses.content import AudioContent, QuizContent, WebsiteExtractResponse
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import AppError, NotFoundError
from app.providers.blob_storage import get_blob_storage_provider
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository
from app.repositories.quiz_repository import QuizRepository
from app.services.website_extractor import WebsiteExtractor

logger = logging.getLogger(__name__)

_MAX_AUDIO_UPLOAD_BYTES = 50 * 1024 * 1024

_AUDIO_VARIANTS = {
    "final": ("output-container", "{id}/1.0.wav"),
    "question": ("output-container", "{id}/question/1.0.wav"),
    "answer": ("output-container", "{id}/answer/1.0.wav"),
    "original": ("output-original", "{id}.mp3"),
    "original_question": ("output-original", "{id}/question.mp3"),
    "original_answer": ("output-original", "{id}/answer.mp3"),
}


def _sort_key(item: AudioContent | QuizContent) -> tuple:
    return (-(item.creation_time or 0), item.id)


def _merge_sorted(
    contents: list[dict[str, Any]], quizzes: list[dict[str, Any]]
) -> list[AudioContent | QuizContent]:
    items: list[AudioContent | QuizContent] = [AudioContent.from_doc(d) for d in contents]
    items += [QuizContent.from_doc(d) for d in quizzes]
    items.sort(key=_sort_key)
    return items


class ContentService:
    def __init__(self, db: AsyncDatabase) -> None:
        self._content_repo = ContentRepository(db)
        self._quiz_repo = QuizRepository(db)
        self._job_repo = ContentJobRepository(db)
        self._website_extractor = WebsiteExtractor()

    async def enqueue_content_job(self, content_id: str) -> str:
        return await self._job_repo.create(content_id)

    async def get_job(self, job_id: str) -> dict[str, Any] | None:
        return await self._job_repo.find_by_id(job_id)

    async def list_active_jobs(self) -> list[dict[str, Any]]:
        return await self._job_repo.find_active()


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
    ) -> list[AudioContent | QuizContent]:
        """Return merged, sorted results of length up to limit+1.

        Callers use len > limit to determine hasMore and slice to limit.
        """
        after_ct = _parse_cursor(cursor)
        fetch_limit = limit + 1

        fetch_content = not (exp_name and exp_name.lower() == "quiz")
        fetch_quizzes = not (exp_name and exp_name.lower() not in (None, "quiz"))

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
        return _merge_sorted(contents, quizzes)

    async def list_content_by_ids(
        self,
        content_ids: list[str],
        tenant_id: str,
        school_id: str | None,
    ) -> list[AudioContent | QuizContent]:
        contents = await self._content_repo.find_by_ids(content_ids, tenant_id, school_id)
        quizzes = await self._quiz_repo.find_by_ids(content_ids, tenant_id, school_id)
        return _merge_sorted(contents, quizzes)

    async def get_content_by_id(
        self,
        content_id: str,
        tenant_id: str,
        school_id: str | None,
    ) -> AudioContent | QuizContent | None:
        doc = await self._content_repo.find_by_id_and_tenant(content_id, tenant_id, school_id)
        if doc:
            return AudioContent.from_doc(doc)
        quiz = await self._quiz_repo.find_by_id_and_tenant(content_id, tenant_id, school_id)
        if quiz:
            return QuizContent.from_doc(quiz)


    async def create_content(
        self,
        body: ContentCreateRequest,
        tenant_id: str,
        user_id: str,
        school_id: str | None,
    ) -> str:
        for item in body.audio_content or []:
            au = item.get("audio_url", "")
            if au and not au.lower().endswith(".mp3"):
                raise ValueError("Only .mp3 audio files are allowed.")

        given = body.model_dump(
            exclude_unset=True,
            exclude={"type", "language", "tenant_id", "created_by", "school_id", "creation_time"},
        )
        dto = ContentCreate(
            **given,
            tenant_id=tenant_id,
            type=body.type,
            language=body.language,
            created_by=user_id,
            school_id=school_id,
            creation_time=int(time.time()),
        )
        doc: dict[str, Any] = dto.model_dump()
        doc["created_at"] = datetime.now(UTC)
        doc["updated_at"] = datetime.now(UTC)
        return await self._content_repo.insert_raw(doc)

    async def update_content(
        self,
        body: ContentUpdateRequest,
        tenant_id: str,
        school_id: str | None,
        is_audio_uploaded: bool,
    ) -> AudioContent | QuizContent | None:
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
            return AudioContent.from_doc(result)

        # Quiz lives in a separate collection; mirror delete_content's fallback.
        quiz_allowed = allowed | {"positive_marks", "negative_marks", "questions"}
        quiz_updates = {k: v for k, v in body_dict.items() if k in quiz_allowed}
        quiz_result = await self._quiz_repo.update_by_id_and_tenant(
            body.id, tenant_id, quiz_updates, school_id
        )
        if quiz_result:
            return QuizContent.from_doc(quiz_result)

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


    async def create_quiz(
        self,
        body: QuizCreateRequest,
        tenant_id: str,
        user_id: str,
        school_id: str | None,
    ) -> str:
        given = body.model_dump(
            exclude_unset=True,
            exclude={"type", "language", "tenant_id", "created_by", "school_id", "creation_time"},
        )
        dto = QuizCreate(
            **given,
            tenant_id=tenant_id,
            type=body.type,
            language=body.language,
            created_by=user_id,
            school_id=school_id,
            creation_time=int(time.time()),
        )
        doc: dict[str, Any] = dto.model_dump()
        return await self._quiz_repo.insert(doc)


    async def get_raw_content_by_id(self, content_id: str) -> dict[str, Any] | None:
        return await self._content_repo.find_raw_by_id(content_id)

    async def save_processed(self, content_id: str, fields: dict[str, Any]) -> None:
        await self._content_repo.save_processed(content_id, fields)

    async def extract_website(self, url: str) -> WebsiteExtractResponse:
        return await self._website_extractor.extract(url)

    async def get_sas_url(self, url: str) -> str:
        try:
            return await get_blob_storage_provider().get_sas_url_from_blob_url(url, expiry_hours=1)
        except Exception as exc:
            logger.error("get_sas_url failed", extra={"err": str(exc)})
            raise AppError("SAS_URL_FAILED", "Could not generate the download link. Try again.", 500) from exc

    async def get_audio_sas_url(self, content_id: str, variant: str, tenant_id: str, school_id: str | None) -> str:
        if not await self.get_content_by_id(content_id, tenant_id, school_id):
            raise NotFoundError("Content", content_id)
        container, name = _AUDIO_VARIANTS[variant]
        return await self.get_sas_url(get_blob_storage_provider().blob_url(container, name.format(id=content_id)))

    async def upload_audio(self, blob_name: str, file: BinaryIO) -> str:
        if not re.fullmatch(r"[\w.-]+\.mp3", blob_name) or ".." in blob_name:
            raise AppError("INVALID_AUDIO_NAME", "Only .mp3 files are allowed.", 400)
        size = file.seek(0, 2)
        file.seek(0)
        if size > _MAX_AUDIO_UPLOAD_BYTES:
            raise AppError("AUDIO_TOO_LARGE", "Audio file is larger than 50 MB. Upload a smaller file.", 413)
        try:
            return await get_blob_storage_provider().upload_file("input-container", blob_name, file, "audio/mpeg")
        except Exception as exc:
            logger.error("upload_audio failed", extra={"blob_name": blob_name, "err": str(exc)})
            raise AppError("AUDIO_UPLOAD_FAILED", "Could not upload the audio file. Try again.", 500) from exc


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


def get_content_service(db: AsyncDatabase = Depends(get_db)) -> ContentService:
    return ContentService(db)
