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
import time
import urllib.parse
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query

from app.models.requests.content_requests import (
    ContentCreateRequest,
    ContentUpdateRequest,
    QuizCreateRequest,
)
from app.models.responses.common import (
    DeleteMatchedResponse,
    JobScheduledResponse,
    JobStatusResponse,
    SasTokenResponse,
    SasUrlResponse,
    ThemeResponse,
)
from app.models.responses.content import ContentResponse, QuizResponse
from app.models.user import UserRole
from app.platform.auth.dependencies import get_current_user
from app.platform.error_handling import ForbiddenError, NotFoundError
from app.providers.blob_storage import BlobStorageProvider
from app.services.content_service import ContentService, get_content_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["Content"])

# Roles allowed for content operations (mirrors JS authorizeRole calls)
_WRITE_ROLES = {UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value}
_READ_ROLES = {UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, UserRole.TEACHER.value, UserRole.CONTENT_CREATOR.value}


def _to_oid(val: str | None) -> Any:
    """Coerce a string to ObjectId if valid, else return as-is."""
    if val and ObjectId.is_valid(val):
        return ObjectId(val)
    return val


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
# School-ID filter helpers (mirrors JS getReadSchoolIdFilter / getWriteSchoolIdFilter)
# ---------------------------------------------------------------------------

def _read_school_filter(user: dict[str, Any]) -> Any | None:
    """For reads: school-scoped users see their school's content + tenant-wide content."""
    role = user.get("role")
    school_id = user.get("school_id")
    if school_id and role in (UserRole.SCHOOL_ADMIN.value, UserRole.TEACHER.value, UserRole.CONTENT_CREATOR.value):
        return {"$in": [_to_oid(school_id), None]}
    return None


def _write_school_filter(user: dict[str, Any]) -> dict:
    """Return a school_id dict for write operations — spread into query/document."""
    role = user.get("role")
    school_id: str | None = None
    if role in (UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value):
        school_id = user.get("school_id")
    return {"school_id": _to_oid(school_id)}


# ---------------------------------------------------------------------------
# Blob SAS helper
# ---------------------------------------------------------------------------

async def _get_sas_url(url: str) -> str:
    try:
        provider = BlobStorageProvider()
        return await provider.get_sas_url_from_blob_url(url, expiry_hours=1)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to generate SAS URL: {exc}") from exc


# ---------------------------------------------------------------------------
# GET /content/job/{jobId}
# ---------------------------------------------------------------------------

@router.get("/job/{job_id}", summary="Get content job status")
async def get_job_status(
    job_id: str,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> JobStatusResponse:
    """Return the status document for a content processing job."""
    doc = await service.get_job(job_id)
    if not doc:
        raise NotFoundError("Job", job_id)
    return JobStatusResponse(
        job_id=job_id,
        status=doc.get("status", "UNKNOWN"),
        content_id=doc.get("content_id"),
    )


# ---------------------------------------------------------------------------
# GET /content/jobs
# ---------------------------------------------------------------------------

@router.get("/jobs", summary="List running and failed content jobs")
async def list_jobs(
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> dict[str, Any]:
    """Return content jobs that are in-progress or failed."""
    docs = await service.list_active_jobs()

    jobs = []
    for doc in docs:
        jobs.append({
            "job_id": str(doc.get("_id", "")),
            "status": "ERROR" if doc.get("status") == "failed" else "IN PROGRESS",
            "content_id": doc.get("content_id"),
            "started_at": doc.get("started_at"),
            "reason": doc.get("reason"),
        })

    return {"jobs": jobs}


# ---------------------------------------------------------------------------
# GET /content/sasUrl
# ---------------------------------------------------------------------------

@router.get("/sasUrl", summary="Generate SAS URL for a blob")
async def get_sas_url(
    url: str = Query(..., description="Blob URL to generate SAS token for"),
    user: dict[str, Any] = Depends(_require_content_read),
) -> SasUrlResponse:
    """Return a read-only SAS URL for the given Azure Blob Storage URL."""
    if not url:
        raise HTTPException(status_code=400, detail="URL parameter is required.")
    sas_url = await _get_sas_url(url)
    return SasUrlResponse(url=sas_url)


# ---------------------------------------------------------------------------
# GET /content/sasToken
# ---------------------------------------------------------------------------

@router.get("/sasToken", summary="Get upload SAS token for MP3 blob")
async def get_sas_token(
    blob_name: str = Query(...),
    user: dict[str, Any] = Depends(_require_content_write),
) -> SasTokenResponse:
    """Return a read-write SAS token URL for direct client upload of an MP3."""
    if not blob_name or not blob_name.lower().endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Only .mp3 files are allowed.")
    try:
        provider = BlobStorageProvider()
        sas_url = await provider.get_upload_sas_url("input-container", blob_name, expiry_hours=1)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return SasTokenResponse(sas_token=sas_url)


# ---------------------------------------------------------------------------
# GET /content/themes
# ---------------------------------------------------------------------------

@router.get("/themes", summary="Get distinct themes for a language")
async def get_themes(
    language: str = Query(...),
    user: dict[str, Any] = Depends(get_current_user),
    service: ContentService = Depends(get_content_service),
) -> list[ThemeResponse]:
    """Return distinct themes with audio URLs for the given language + tenant."""
    tenant_id = user.get("tenant_id", "")
    school_filter = _read_school_filter(user)

    query: dict = {
        "tenant_id": _to_oid(tenant_id),
        "language": language,
        "is_pull_model": True,
        "is_deleted": {"$ne": True},
    }
    if school_filter is not None:
        query["school_id"] = school_filter

    docs = await service.get_themes(query)

    seen: set = set()
    themes: list[ThemeResponse] = []
    for doc in docs:
        theme = (doc.get("theme") or {}).get("english", "")
        if theme and theme not in seen:
            themes.append(ThemeResponse(
                name=theme,
                audio_url=(doc.get("theme") or {}).get("audioUrl", ""),
            ))
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
    """Return paginated content items, optionally filtered by language/theme/type."""
    tenant_id = user.get("tenant_id", "")
    school_filter = _read_school_filter(user)

    base_query: dict = {"is_deleted": {"$ne": True}, "tenant_id": _to_oid(tenant_id)}
    if school_filter is not None:
        base_query["school_id"] = school_filter

    # Fetch by specific IDs
    if ids is not None:
        if len(ids) == 0:
            raise HTTPException(status_code=400, detail="ids query parameter must be a non-empty array")
        id_query = {**base_query, "_id": {"$in": ids}}
        contents = await service.fetch_contents(id_query)
        quizzes = await service.fetch_quizzes(id_query)
        all_items = sorted(
            [ContentResponse.model_validate(d).model_dump(by_alias=False, exclude_none=True) for d in contents]
            + [{**QuizResponse.model_validate(d).model_dump(by_alias=False, exclude_none=True), "type": "quiz"} for d in quizzes],
            key=lambda x: (-x.get("creation_time", 0), str(x.get("id", ""))),
        )
        return all_items

    content_query = {**base_query}
    quiz_query = {**base_query}
    fetch_content = True
    fetch_quizzes = True

    if only_teacher_app:
        content_query["is_teacher_app"] = True
        quiz_query["is_teacher_app"] = True
    elif language and theme and exp_name:
        decoded_theme = urllib.parse.unquote(theme)
        if exp_name.lower() == "quiz":
            fetch_content = False
            quiz_query.update({"is_pull_model": True, "language": language, "theme.english": decoded_theme})
        else:
            fetch_quizzes = False
            content_query.update({
                "is_pull_model": True,
                "language": language,
                "theme.english": decoded_theme,
                "type": exp_name.lower(),
            })

    # Cursor-based pagination
    if cursor:
        parts = cursor.split("_", 1)
        if len(parts) == 2:
            try:
                last_ct = int(parts[0])
                cursor_filter = {"creation_time": {"$lte": last_ct}}
                if fetch_content:
                    content_query = {**content_query, **cursor_filter}
                if fetch_quizzes:
                    quiz_query = {**quiz_query, **cursor_filter}
            except ValueError:
                pass

    # Fetch limit+1 per collection to bound memory; Python sort only needed for
    # the combined content+quiz case (cross-collection ordering).
    fetch_limit = limit + 1
    contents = await service.fetch_contents(content_query, limit=fetch_limit) if fetch_content else []
    quizzes = await service.fetch_quizzes(quiz_query, limit=fetch_limit) if fetch_quizzes else []

    all_results = sorted(
        [ContentResponse.model_validate(d).model_dump(by_alias=True, exclude_none=True) for d in contents]
        + [{**QuizResponse.model_validate(d).model_dump(by_alias=True, exclude_none=True), "type": "quiz"} for d in quizzes],
        key=lambda x: (-x.get("creation_time", 0), str(x.get("_id", ""))),
    )

    has_more = len(all_results) > limit
    data = all_results[:limit]
    last_item = data[-1] if data else None
    next_cursor = (
        f"{last_item['creation_time']}_{last_item['id']}"
        if has_more and last_item
        else None
    )

    return {"data": data, "pagination": {"nextCursor": next_cursor, "hasMore": has_more, "limit": limit}}


# ---------------------------------------------------------------------------
# GET /content/{content_id}
# ---------------------------------------------------------------------------

@router.get("/{content_id}", summary="Get content by ID")
async def get_content(
    content_id: str,
    user: dict[str, Any] = Depends(_require_content_read),
    service: ContentService = Depends(get_content_service),
) -> Any:
    """Return a content item by ID, scoped to the authenticated tenant."""
    tenant_id = user.get("tenant_id", "")
    school_filter = _read_school_filter(user)

    query: dict = {
        "_id": content_id,
        "tenant_id": _to_oid(tenant_id),
        "is_deleted": {"$ne": True},
    }
    if school_filter is not None:
        query["school_id"] = school_filter

    doc = await service.get_content_doc(query)
    if doc:
        return ContentResponse.model_validate(doc).model_dump(by_alias=False, exclude_none=True)

    quiz = await service.get_quiz_doc(query)
    if quiz:
        return {**QuizResponse.model_validate(quiz).model_dump(by_alias=False, exclude_none=True), "type": "quiz"}

    raise NotFoundError("Content", content_id)


# ---------------------------------------------------------------------------
# POST /content — create + trigger job
# ---------------------------------------------------------------------------

@router.post("", summary="Create content and trigger processing job", status_code=201)
async def create_content(
    body: ContentCreateRequest,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> JobScheduledResponse:
    """Create a new content document and enqueue a processing job."""
    tenant_id = user.get("tenant_id", "")
    user_id = user.get("sub", "")

    for item in body.audio_content or []:
        au = item.get("audio_url", "") if isinstance(item, dict) else ""
        if au and not au.lower().endswith(".mp3"):
            raise HTTPException(status_code=400, detail="Only .mp3 audio files are allowed.")

    now_ts = int(time.time())
    body_dict = body.model_dump(by_alias=False, exclude_unset=True)
    doc: dict = {
        **body_dict,
        "tenant_id": _to_oid(tenant_id),
        "created_by": user_id,
        "creation_time": now_ts,
        **_write_school_filter(user),
        "is_deleted": False,
        "is_processed": False,
    }

    content_id = await service.insert_content(doc)
    job_id = await service.enqueue_content_job(content_id)

    logger.info("content_controller: created content_id=%s job_id=%s", content_id, job_id)
    return JobScheduledResponse(message="Processing New Content job scheduled!", job_id=job_id)


# ---------------------------------------------------------------------------
# PATCH /content — update + optionally re-trigger job
# ---------------------------------------------------------------------------

@router.patch("", summary="Update content")
async def update_content(
    body: ContentUpdateRequest,
    is_audio_uploaded: bool = Query(False, alias="isAudioUploaded"),
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> Any:
    """Update a content item. Re-triggers processing job if isAudioUploaded=true."""
    tenant_id = user.get("tenant_id", "")
    content_id = body.id

    write_filter: dict = {
        "_id": content_id,
        "tenant_id": _to_oid(tenant_id),
        "is_deleted": {"$ne": True},
        **_write_school_filter(user),
    }

    allowed = {"title", "theme", "description", "type", "language", "is_pull_model", "is_teacher_app"}
    body_dict = body.model_dump(by_alias=False, exclude_unset=True)
    update: dict = {k: v for k, v in body_dict.items() if k in allowed}

    if is_audio_uploaded:
        if "audio_content" in body.model_fields_set:
            for item in body.audio_content or []:
                au = item.get("audio_url", "") if isinstance(item, dict) else ""
                if au and not au.lower().endswith(".mp3"):
                    raise HTTPException(status_code=400, detail="Only .mp3 audio files are allowed.")
            update["audio_content"] = body.audio_content
        update["is_processed"] = False

    update["updated_at"] = datetime.now(UTC)

    result = await service.update_content_doc(write_filter, update)

    if result:
        if is_audio_uploaded:
            content_id_str = str(result.get("_id", ""))
            job_id = await service.enqueue_content_job(content_id_str)
            out = ContentResponse.model_validate(result).model_dump(by_alias=False, exclude_none=True)
            out["job_id"] = job_id
            return out
        return ContentResponse.model_validate(result).model_dump(by_alias=False, exclude_none=True)

    raise NotFoundError("Content", str(content_id))


# ---------------------------------------------------------------------------
# DELETE /content/{content_id}
# ---------------------------------------------------------------------------

@router.delete("/{content_id}", summary="Soft-delete content by ID")
async def delete_content(
    content_id: str,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> DeleteMatchedResponse:
    """Soft-delete a content item (sets is_deleted=true)."""
    tenant_id = user.get("tenant_id", "")
    write_filter: dict = {
        "_id": content_id,
        "tenant_id": _to_oid(tenant_id),
        **_write_school_filter(user),
    }

    matched = await service.soft_delete_content(write_filter)
    if matched > 0:
        return DeleteMatchedResponse(matched=matched)

    quiz_matched = await service.soft_delete_quiz(write_filter)
    if quiz_matched > 0:
        return DeleteMatchedResponse(matched=quiz_matched)

    raise NotFoundError("Content", content_id)


# ---------------------------------------------------------------------------
# POST /content/quiz — create quiz + trigger job
# ---------------------------------------------------------------------------

@router.post("/quiz", summary="Create quiz and trigger processing job")
async def create_quiz(
    body: QuizCreateRequest,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> JobScheduledResponse:
    """Create a new quiz document and enqueue a processing job."""
    tenant_id = user.get("tenant_id", "")
    user_id = user.get("sub", "")

    now_ts = int(time.time())
    body_dict = body.model_dump(by_alias=False, exclude_unset=True)
    school_id = user.get("school_id") if user.get("role") in (UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value) else None
    doc: dict = {
        **body_dict,
        "tenant_id": _to_oid(tenant_id),
        "created_by": _to_oid(user_id),
        "creation_time": now_ts,
        "school_id": _to_oid(school_id),
        "is_deleted": False,
    }

    quiz_id = await service.insert_quiz(doc)
    job_id = await service.enqueue_content_job(quiz_id)

    return JobScheduledResponse(message="Processing New Content job scheduled!", job_id=job_id)
