"""
Content controller — /content/* endpoints.

Ported from backend-server/src/routes/contentRouter.js.

Preserves ALL original URL paths exactly.

SECURITY:
  - All routes require authentication.
  - Write operations enforce tenant scoping (tenantId from JWT, not request body).
  - Audio file validation: only .mp3 files accepted for upload URLs.
  - SAS tokens are never logged.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.requests.content_requests import (
    ContentCreateRequest,
    ContentUpdateRequest,
    QuizCreateRequest,
)
from app.models.responses.content import ContentResponse, QuizResponse
from app.models.responses.job import DeleteMatchedResponse, JobScheduledResponse
from app.models.user import UserRole
from app.platform.auth.dependencies import get_current_user
from app.platform.error_handling import ForbiddenError, NotFoundError
from app.providers.blob_storage import BlobStorageProvider
from app.services.content_service import ContentService, get_content_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["Content"])

_WRITE_ROLES = frozenset({UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value})
_READ_ROLES = frozenset({
    UserRole.TENANT.value,
    UserRole.SCHOOL_ADMIN.value,
    UserRole.TEACHER.value,
    UserRole.CONTENT_CREATOR.value,
})
_SCHOOL_READ_ROLES = frozenset({
    UserRole.SCHOOL_ADMIN.value,
    UserRole.TEACHER.value,
    UserRole.CONTENT_CREATOR.value,
})
_SCHOOL_WRITE_ROLES = frozenset({UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value})

# ---------------------------------------------------------------------------
# Auth dependency helpers
# ---------------------------------------------------------------------------


async def _require_content_read(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if user.get("role") not in _READ_ROLES:
        raise ForbiddenError("insufficient role for content read")
    return user


async def _require_content_write(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    if user.get("role") not in _WRITE_ROLES:
        raise ForbiddenError("insufficient role for content write")
    return user


# ---------------------------------------------------------------------------
# JWT extraction helpers — no query logic here
# ---------------------------------------------------------------------------


def _read_school_id(user: dict[str, Any]) -> str | None:
    """Return school_id for school-scoped roles; None for tenant (sees all)."""
    return user.get("school_id") or None if user.get("role") in _SCHOOL_READ_ROLES else None


def _write_school_id(user: dict[str, Any]) -> str | None:
    """Return school_id for write-scoped roles; None for tenant."""
    return user.get("school_id") or None if user.get("role") in _SCHOOL_WRITE_ROLES else None


# Aliases used by existing tests
def _read_school_filter(user: dict[str, Any]) -> str | None:
    return _read_school_id(user)


def _write_school_filter(user: dict[str, Any]) -> dict[str, str | None]:
    return {"schoolId": _write_school_id(user)}


# ---------------------------------------------------------------------------
# Response serialisation helpers
# ---------------------------------------------------------------------------


def _sort_key(item: dict) -> tuple:
    return (-item.get("creation_time", 0), str(item.get("_id", "")))


# ---------------------------------------------------------------------------
# Blob SAS helpers
# ---------------------------------------------------------------------------


async def _get_sas_url(url: str) -> str:
    try:
        provider = BlobStorageProvider()
        return await provider.get_sas_url_from_blob_url(url, expiry_hours=1)
    except Exception as exc:
        logger.error("_get_sas_url failed", extra={"err": str(exc)})
        raise HTTPException(status_code=500, detail=f"Failed to generate SAS URL: {exc}") from exc


# ---------------------------------------------------------------------------
# GET /content/job/{jobId}
# ---------------------------------------------------------------------------


@router.get("/job/{job_id}", summary="Get content job status")
async def get_job_status(
    job_id: str,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> dict[str, Any]:
    doc = await service.get_job(job_id)
    if not doc:
        raise NotFoundError("Job", job_id)
    doc.pop("_id", None)
    doc["jobId"] = job_id
    return doc


# ---------------------------------------------------------------------------
# GET /content/jobs
# ---------------------------------------------------------------------------


@router.get("/jobs", summary="List running and failed content jobs")
async def list_jobs(
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> dict[str, Any]:
    docs = await service.list_active_jobs()
    jobs = [
        {
            "jobId": str(doc.get("_id", "")),
            "status": "ERROR" if doc.get("status") == "failed" else "IN PROGRESS",
            "contentId": doc.get("content_id"),
            "startedAt": doc.get("started_at"),
            "reason": doc.get("reason"),
        }
        for doc in docs
    ]
    return {"jobs": jobs}


# ---------------------------------------------------------------------------
# GET /content/sasUrl
# ---------------------------------------------------------------------------


@router.get("/sasUrl", summary="Generate SAS URL for a blob")
async def get_sas_url(
    url: str = Query(..., description="Blob URL to generate SAS token for"),
    user: dict[str, Any] = Depends(_require_content_read),
) -> dict[str, Any]:
    if not url:
        raise HTTPException(status_code=400, detail="URL parameter is required.")
    return {"url": await _get_sas_url(url)}


# ---------------------------------------------------------------------------
# GET /content/sasToken
# ---------------------------------------------------------------------------


@router.get("/sasToken", summary="Get upload SAS token for MP3 blob")
async def get_sas_token(
    blob_name: str = Query(..., alias="blobName"),
    user: dict[str, Any] = Depends(_require_content_write),
) -> dict[str, Any]:
    if not blob_name or not blob_name.lower().endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Only .mp3 files are allowed.")
    try:
        provider = BlobStorageProvider()
        sas_url = await provider.get_upload_sas_url("input-container", blob_name, expiry_hours=1)
    except Exception as exc:
        logger.error("get_sas_token failed", extra={"blob_name": blob_name, "err": str(exc)})
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"sasToken": sas_url}


# ---------------------------------------------------------------------------
# GET /content/themes
# ---------------------------------------------------------------------------


@router.get("/themes", summary="Get distinct themes for a language")
async def get_themes(
    language: str = Query(...),
    user: dict[str, Any] = Depends(get_current_user),
    service: ContentService = Depends(get_content_service),
) -> list[dict]:
    tenant_id = user.get("tenant_id", "")
    school_id = _read_school_id(user)

    docs = await service.get_themes(tenant_id, language, school_id)

    seen: set = set()
    themes: list = []
    for doc in docs:
        theme = (doc.get("theme") or {}).get("english", "")
        if theme and theme not in seen:
            themes.append({
                "name": theme,
                "audioUrl": (doc.get("theme") or {}).get("audioUrl", ""),
            })
            seen.add(theme)
    return themes


# ---------------------------------------------------------------------------
# GET /content
# ---------------------------------------------------------------------------


@router.get("", summary="List content (cursor pagination)")
async def list_content(
    language: str | None = None,
    theme: str | None = None,
    exp_name: str | None = Query(None, alias="expName"),
    ids: list[str] | None = Query(None),
    only_teacher_app: bool | None = Query(None, alias="onlyTeacherApp"),
    limit: int = Query(15, ge=1, le=200),
    cursor: str | None = None,
    user: dict[str, Any] = Depends(_require_content_read),
    service: ContentService = Depends(get_content_service),
) -> Any:
    tenant_id = user.get("tenant_id", "")
    school_id = _read_school_id(user)

    # Fetch by specific IDs
    if ids is not None:
        if not ids:
            raise HTTPException(status_code=400, detail="ids must be a non-empty array")
        contents, quizzes = await service.list_content_by_ids(ids, tenant_id, school_id)
        return sorted(
            [ContentResponse.from_doc(d) for d in contents] + [QuizResponse.from_doc(d) for d in quizzes],
            key=_sort_key,
        )

    contents, quizzes = await service.list_content(
        tenant_id=tenant_id,
        school_id=school_id,
        language=language,
        theme=theme,
        exp_name=exp_name,
        only_teacher_app=bool(only_teacher_app),
        cursor=cursor,
        limit=limit,
    )

    all_results = sorted(
        [ContentResponse.from_doc(d) for d in contents] + [QuizResponse.from_doc(d) for d in quizzes],
        key=_sort_key,
    )

    has_more = len(all_results) > limit
    data = all_results[:limit]
    last = data[-1] if data else None
    next_cursor = (
        f"{last['creation_time']}_{last['_id']}" if has_more and last else None
    )

    return {
        "data": data,
        "pagination": {"nextCursor": next_cursor, "hasMore": has_more, "limit": limit},
    }


# ---------------------------------------------------------------------------
# GET /content/{content_id}
# ---------------------------------------------------------------------------


@router.get("/{content_id}", summary="Get content by ID")
async def get_content(
    content_id: str,
    user: dict[str, Any] = Depends(_require_content_read),
    service: ContentService = Depends(get_content_service),
) -> Any:
    tenant_id = user.get("tenant_id", "")
    school_id = _read_school_id(user)

    doc, quiz = await service.get_content_by_id(content_id, tenant_id, school_id)
    if doc:
        return ContentResponse.from_doc(doc)
    if quiz:
        return QuizResponse.from_doc(quiz)
    raise NotFoundError("Content", content_id)


# ---------------------------------------------------------------------------
# POST /content
# ---------------------------------------------------------------------------


@router.post("", summary="Create content and trigger processing job", status_code=201)
async def create_content(
    body: ContentCreateRequest,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> JobScheduledResponse:
    tenant_id = user.get("tenant_id", "")
    user_id = user.get("sub", "")
    school_id = _write_school_id(user)

    body_dict = body.model_dump(by_alias=True, exclude_unset=True)
    override_id = body_dict.get("_id")

    try:
        content_id = await service.create_content(body, tenant_id, user_id, school_id, override_id)
    except ValueError as exc:
        logger.error("create_content failed", extra={"tenant_id": tenant_id, "user_id": user_id, "err": str(exc)})
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    job_id = await service.enqueue_content_job(content_id)
    logger.info("content_controller: created content_id=%s job_id=%s", content_id, job_id)
    return JobScheduledResponse(message="Processing New Content job scheduled!", jobId=job_id)


# ---------------------------------------------------------------------------
# PATCH /content
# ---------------------------------------------------------------------------


@router.patch("", summary="Update content")
async def update_content(
    body: ContentUpdateRequest,
    is_audio_uploaded: bool = Query(False, alias="isAudioUploaded"),
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> Any:
    tenant_id = user.get("tenant_id", "")
    school_id = _write_school_id(user)

    try:
        result = await service.update_content(body, tenant_id, school_id, is_audio_uploaded)
    except ValueError as exc:
        logger.error("update_content failed", extra={"tenant_id": tenant_id, "content_id": str(body.id), "err": str(exc)})
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    if result:
        if is_audio_uploaded:
            job_id = await service.enqueue_content_job(str(result.get("_id", "")))
            out = ContentResponse.from_doc(result)
            out["jobId"] = job_id
            return out
        return ContentResponse.from_doc(result)

    raise NotFoundError("Content", str(body.id))


# ---------------------------------------------------------------------------
# DELETE /content/{content_id}
# ---------------------------------------------------------------------------


@router.delete("/{content_id}", summary="Soft-delete content by ID")
async def delete_content(
    content_id: str,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> DeleteMatchedResponse:
    tenant_id = user.get("tenant_id", "")
    school_id = _write_school_id(user)

    matched = await service.delete_content(content_id, tenant_id, school_id)
    if matched:
        return {"matched": matched}
    raise NotFoundError("Content", content_id)


# ---------------------------------------------------------------------------
# POST /content/quiz
# ---------------------------------------------------------------------------


@router.post("/quiz", summary="Create quiz and trigger processing job")
async def create_quiz(
    body: QuizCreateRequest,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> JobScheduledResponse:
    tenant_id = user.get("tenant_id", "")
    user_id = user.get("sub", "")
    school_id = _write_school_id(user)

    body_dict = body.model_dump(by_alias=True, exclude_unset=True)
    override_id = body_dict.get("id")

    quiz_id = await service.create_quiz(body, tenant_id, user_id, school_id, override_id)
    job_id = await service.enqueue_content_job(quiz_id)
    return JobScheduledResponse(message="Processing New Content job scheduled!", jobId=job_id)
