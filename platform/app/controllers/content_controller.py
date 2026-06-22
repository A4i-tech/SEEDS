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
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.platform.auth.dependencies import get_current_user
from app.models.requests.content_requests import (
    ContentCreateRequest,
    ContentUpdateRequest,
    QuizCreateRequest,
)
from app.models.user import UserRole
from app.platform.error_handling import ForbiddenError, NotFoundError
from app.providers.blob_storage import BlobStorageProvider
from app.services.content_service import ContentService, get_content_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["Content"])

# Roles allowed for content operations (mirrors JS authorizeRole calls)
_WRITE_ROLES = {UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value}
_READ_ROLES = {UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, UserRole.TEACHER.value, UserRole.CONTENT_CREATOR.value}


# ---------------------------------------------------------------------------
# Response DTOs
# ---------------------------------------------------------------------------

class ContentOut(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="allow")

    id: Optional[str] = Field(None, alias="_id")

    @field_validator("id", mode="before")
    @classmethod
    def _coerce_id(cls, v: Any) -> Optional[str]:
        return str(v) if v is not None else None


class QuizOut(ContentOut):
    pass


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

def _read_school_filter(user: dict[str, Any]) -> Optional[Any]:
    """For reads: school-scoped users see their school's content + tenant-wide content."""
    role = user.get("role", "")
    school_id = user.get("school_id") or user.get("schoolId")
    if school_id and role in (UserRole.SCHOOL_ADMIN.value, UserRole.TEACHER.value, UserRole.CONTENT_CREATOR.value):
        return {"$in": [school_id, None]}
    return None


def _write_school_filter(user: dict[str, Any]) -> dict:
    """Return a schoolId dict for write operations — spread into query/document."""
    role = user.get("role", "")
    school_id: Optional[str] = None
    if role in (UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value):
        school_id = user.get("school_id") or user.get("schoolId") or None
    return {"schoolId": school_id}


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
) -> dict[str, Any]:
    """Return the status document for a content processing job."""
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
    """Return content jobs that are in-progress or failed."""
    docs = await service.list_active_jobs()

    jobs = []
    for doc in docs:
        jobs.append({
            "jobId": str(doc.get("_id", "")),
            "status": "ERROR" if doc.get("status") == "failed" else "IN PROGRESS",
            "contentId": doc.get("content_id"),
            "startedAt": doc.get("started_at"),
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
) -> dict[str, Any]:
    """Return a read-only SAS URL for the given Azure Blob Storage URL."""
    if not url:
        raise HTTPException(status_code=400, detail="URL parameter is required.")
    sas_url = await _get_sas_url(url)
    return {"url": sas_url}


# ---------------------------------------------------------------------------
# GET /content/sasToken
# ---------------------------------------------------------------------------

@router.get("/sasToken", summary="Get upload SAS token for MP3 blob")
async def get_sas_token(
    blob_name: str = Query(..., alias="blobName"),
    user: dict[str, Any] = Depends(_require_content_write),
) -> dict[str, Any]:
    """Return a read-write SAS token URL for direct client upload of an MP3."""
    if not blob_name or not blob_name.lower().endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Only .mp3 files are allowed.")
    try:
        provider = BlobStorageProvider()
        sas_url = await provider.get_upload_sas_url("input-container", blob_name, expiry_hours=1)
    except Exception as exc:  # noqa: BLE001
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
    """Return distinct themes with audio URLs for the given language + tenant."""
    tenant_id = user.get("tenant_id", "")
    school_filter = _read_school_filter(user)

    query: dict = {
        "tenantId": tenant_id,
        "language": language,
        "isPullModel": True,
        "isDeleted": {"$ne": True},
    }
    if school_filter is not None:
        query["schoolId"] = school_filter

    docs = await service.get_themes(query)

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
    language: Optional[str] = None,
    theme: Optional[str] = None,
    exp_name: Optional[str] = Query(None, alias="expName"),
    ids: Optional[List[str]] = Query(None),
    only_teacher_app: Optional[bool] = Query(None, alias="onlyTeacherApp"),
    limit: int = Query(15, ge=1, le=200),
    cursor: Optional[str] = None,
    user: dict[str, Any] = Depends(_require_content_read),
    service: ContentService = Depends(get_content_service),
) -> Any:
    """Return paginated content items, optionally filtered by language/theme/type."""
    tenant_id = user.get("tenant_id", "")
    school_filter = _read_school_filter(user)

    base_query: dict = {"isDeleted": {"$ne": True}, "tenantId": tenant_id}
    if school_filter is not None:
        base_query["schoolId"] = school_filter

    # Fetch by specific IDs
    if ids is not None:
        if len(ids) == 0:
            raise HTTPException(status_code=400, detail="ids query parameter must be a non-empty array")
        id_query = {**base_query, "_id": {"$in": ids}}
        contents = await service.fetch_contents(id_query)
        quizzes = await service.fetch_quizzes(id_query)
        all_items = sorted(
            [ContentOut.model_validate(d).model_dump(by_alias=False) for d in contents]
            + [{**QuizOut.model_validate(d).model_dump(by_alias=False), "type": "quiz"} for d in quizzes],
            key=lambda x: (-x.get("creation_time", 0), str(x.get("id", ""))),
        )
        return all_items

    content_query = {**base_query}
    quiz_query = {**base_query}
    fetch_content = True
    fetch_quizzes = True

    if only_teacher_app:
        content_query["isTeacherApp"] = True
        quiz_query["isTeacherApp"] = True
    elif language and theme and exp_name:
        decoded_theme = urllib.parse.unquote(theme)
        if exp_name.lower() == "quiz":
            fetch_content = False
            quiz_query.update({"isPullModel": True, "language": language, "theme.english": decoded_theme})
        else:
            fetch_quizzes = False
            content_query.update({
                "isPullModel": True,
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

    contents = await service.fetch_contents(content_query) if fetch_content else []
    quizzes = await service.fetch_quizzes(quiz_query) if fetch_quizzes else []

    all_results = sorted(
        [ContentOut.model_validate(d).model_dump(by_alias=False) for d in contents]
        + [{**QuizOut.model_validate(d).model_dump(by_alias=False), "type": "quiz"} for d in quizzes],
        key=lambda x: (-x.get("creation_time", 0), str(x.get("id", ""))),
    )

    # Skip past cursor position
    if cursor:
        parts = cursor.split("_", 1)
        if len(parts) == 2:
            try:
                last_ct = int(parts[0])
                last_id = parts[1]
                idx = next(
                    (i for i, x in enumerate(all_results)
                     if x.get("creation_time") == last_ct and str(x.get("id", "")) == last_id),
                    None,
                )
                if idx is not None:
                    all_results = all_results[idx + 1:]
            except ValueError:
                pass

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
        "tenantId": tenant_id,
        "isDeleted": {"$ne": True},
    }
    if school_filter is not None:
        query["schoolId"] = school_filter

    doc = await service.get_content_doc(query)
    if doc:
        return ContentOut.model_validate(doc).model_dump(by_alias=False)

    quiz = await service.get_quiz_doc(query)
    if quiz:
        return {**QuizOut.model_validate(quiz).model_dump(by_alias=False), "type": "quiz"}

    raise NotFoundError("Content", content_id)


# ---------------------------------------------------------------------------
# POST /content — create + trigger job
# ---------------------------------------------------------------------------

@router.post("", summary="Create content and trigger processing job", status_code=201)
async def create_content(
    body: ContentCreateRequest,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> dict[str, Any]:
    """Create a new content document and enqueue a processing job.

    Returns ``{"message": "...", "jobId": "..."}``.
    """
    tenant_id = user.get("tenant_id", "")
    user_id = user.get("sub", "")

    for item in body.audio_content or []:
        au = item.get("audioUrl", "")
        if au and not au.lower().endswith(".mp3"):
            raise HTTPException(status_code=400, detail="Only .mp3 audio files are allowed.")

    now_ts = int(time.time())
    body_dict = body.model_dump(by_alias=True, exclude_unset=True)
    doc: dict = {
        **body_dict,
        "tenantId": tenant_id,
        "createdBy": user_id,
        "creation_time": now_ts,
        **_write_school_filter(user),
        "isDeleted": False,
        "isProcessed": False,
    }

    content_id = await service.insert_content(doc)
    job_id = await service.enqueue_content_job(content_id)

    logger.info("content_controller: created content_id=%s job_id=%s", content_id, job_id)
    return {"message": "Processing New Content job scheduled!", "jobId": job_id}


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
        "tenantId": tenant_id,
        "isDeleted": {"$ne": True},
        **_write_school_filter(user),
    }

    allowed = {"title", "theme", "description", "type", "language", "isPullModel", "isTeacherApp"}
    body_dict = body.model_dump(by_alias=True, exclude_unset=True)
    update: dict = {k: v for k, v in body_dict.items() if k in allowed}

    if is_audio_uploaded:
        if "audio_content" in body.model_fields_set:
            for item in body.audio_content or []:
                au = item.get("audioUrl", "")
                if au and not au.lower().endswith(".mp3"):
                    raise HTTPException(status_code=400, detail="Only .mp3 audio files are allowed.")
            update["audioContent"] = body.audio_content
        update["isProcessed"] = False

    update["updated_at"] = datetime.now(timezone.utc)

    result = await service.update_content_doc(write_filter, update)

    if result:
        if is_audio_uploaded:
            content_id_str = str(result.get("_id", ""))
            job_id = await service.enqueue_content_job(content_id_str)
            out = ContentOut.model_validate(result).model_dump(by_alias=False)
            out["jobId"] = job_id
            return out
        return ContentOut.model_validate(result).model_dump(by_alias=False)

    raise NotFoundError("Content", str(content_id))


# ---------------------------------------------------------------------------
# DELETE /content/{content_id}
# ---------------------------------------------------------------------------

@router.delete("/{content_id}", summary="Soft-delete content by ID")
async def delete_content(
    content_id: str,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> Any:
    """Soft-delete a content item (sets isDeleted=true)."""
    tenant_id = user.get("tenant_id", "")
    write_filter: dict = {
        "_id": content_id,
        "tenantId": tenant_id,
        **_write_school_filter(user),
    }

    matched = await service.soft_delete_content(write_filter)
    if matched > 0:
        return {"matched": matched}

    quiz_matched = await service.soft_delete_quiz(write_filter)
    if quiz_matched > 0:
        return {"matched": quiz_matched}

    raise NotFoundError("Content", content_id)


# ---------------------------------------------------------------------------
# POST /content/quiz — create quiz + trigger job
# ---------------------------------------------------------------------------

@router.post("/quiz", summary="Create quiz and trigger processing job")
async def create_quiz(
    body: QuizCreateRequest,
    user: dict[str, Any] = Depends(_require_content_write),
    service: ContentService = Depends(get_content_service),
) -> dict[str, Any]:
    """Create a new quiz document and enqueue a processing job."""
    tenant_id = user.get("tenant_id", "")
    user_id = user.get("sub", "")

    now_ts = int(time.time())
    body_dict = body.model_dump(by_alias=True, exclude_unset=True)
    doc: dict = {
        **body_dict,
        "tenantId": tenant_id,
        "createdBy": user_id,
        "creation_time": now_ts,
        **_write_school_filter(user),
        "isDeleted": False,
    }

    quiz_id = await service.insert_quiz(doc)
    job_id = await service.enqueue_content_job(quiz_id)

    return {"message": "Processing New Content job scheduled!", "jobId": job_id}
