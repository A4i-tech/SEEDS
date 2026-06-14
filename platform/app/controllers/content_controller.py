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
import uuid
from datetime import datetime, timezone
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.dependencies import (
    get_current_user,
    get_db,
    require_teacher,
    require_tenant,
)
from app.platform.error_handling import ForbiddenError, NotFoundError

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Content"])

# Roles allowed for content operations (mirrors JS authorizeRole calls)
_WRITE_ROLES = {"tenant", "school_admin", "content_creator"}
_READ_ROLES = {"tenant", "school_admin", "teacher", "content_creator"}


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
    if school_id and role in ("school_admin", "teacher", "content_creator"):
        return {"$in": [school_id, None]}
    return None


def _write_school_filter(user: dict[str, Any]) -> Optional[str]:
    """For writes: return the school_id if the user is school-scoped, else None."""
    role = user.get("role", "")
    if role in ("school_admin", "content_creator"):
        return user.get("school_id") or user.get("schoolId") or None
    return None


# ---------------------------------------------------------------------------
# Blob SAS helper
# ---------------------------------------------------------------------------

async def _get_sas_url(url: str) -> str:
    try:
        from app.providers.blob_storage import BlobStorageProvider  # noqa: PLC0415
        provider = BlobStorageProvider()
        return await provider.get_sas_url_from_blob_url(url, expiry_hours=1)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Failed to generate SAS URL: {exc}") from exc


# ---------------------------------------------------------------------------
# Job enqueueing helper
# ---------------------------------------------------------------------------

async def _enqueue_content_job(content_id: str, db: AsyncIOMotorDatabase) -> str:
    """Insert a pending job document and return the job _id as a string."""
    job_doc: dict = {
        "_id": str(uuid.uuid4()),
        "content_id": content_id,
        "status": "pending",
        "created_at": datetime.now(timezone.utc),
    }
    await db["content_jobs"].insert_one(job_doc)
    return str(job_doc["_id"])


# ---------------------------------------------------------------------------
# GET /content/job/{jobId}
# ---------------------------------------------------------------------------

@router.get("/content/job/{job_id}", summary="Get content job status")
async def get_job_status(
    job_id: str,
    user: dict[str, Any] = Depends(_require_content_write),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return the status document for a content processing job."""
    doc = await db["content_jobs"].find_one({"_id": job_id})
    if not doc:
        raise NotFoundError("Job", job_id)
    doc.pop("_id", None)
    doc["jobId"] = job_id
    return doc


# ---------------------------------------------------------------------------
# GET /content/jobs
# ---------------------------------------------------------------------------

@router.get("/content/jobs", summary="List running and failed content jobs")
async def list_jobs(
    user: dict[str, Any] = Depends(_require_content_write),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return content jobs that are in-progress or failed."""
    cursor = db["content_jobs"].find(
        {"status": {"$in": ["running", "failed", "claimed"]}}
    ).sort("created_at", -1)
    docs = await cursor.to_list(length=None)

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

@router.get("/content/sasUrl", summary="Generate SAS URL for a blob")
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

@router.get("/content/sasToken", summary="Get upload SAS token for MP3 blob")
async def get_sas_token(
    blob_name: str = Query(..., alias="blobName"),
    user: dict[str, Any] = Depends(_require_content_write),
) -> dict[str, Any]:
    """Return a read-write SAS token URL for direct client upload of an MP3."""
    if not blob_name or not blob_name.lower().endswith(".mp3"):
        raise HTTPException(status_code=400, detail="Only .mp3 files are allowed.")
    try:
        from app.providers.blob_storage import BlobStorageProvider  # noqa: PLC0415
        provider = BlobStorageProvider()
        sas_url = await provider.get_upload_sas_url("input-container", blob_name, expiry_hours=1)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"sasToken": sas_url}


# ---------------------------------------------------------------------------
# GET /content/themes
# ---------------------------------------------------------------------------

@router.get("/content/themes", summary="Get distinct themes for a language")
async def get_themes(
    language: str = Query(...),
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> list[dict]:
    """Return distinct themes with audio URLs for the given language + tenant."""
    tenant_id = user.get("tenant_id") or user.get("tenantId", "")
    school_filter = _read_school_filter(user)

    query: dict = {
        "tenantId": tenant_id,
        "language": language,
        "isPullModel": True,
        "isDeleted": {"$ne": True},
    }
    if school_filter is not None:
        query["schoolId"] = school_filter

    cursor = db["contentsV3"].find(query).sort("_id", -1)
    docs = await cursor.to_list(length=None)

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

@router.get("/content", summary="List content (cursor pagination)")
async def list_content(
    language: Optional[str] = None,
    theme: Optional[str] = None,
    exp_name: Optional[str] = Query(None, alias="expName"),
    ids: Optional[List[str]] = Query(None),
    only_teacher_app: Optional[bool] = Query(None, alias="onlyTeacherApp"),
    limit: int = Query(15, ge=1, le=200),
    cursor: Optional[str] = None,
    user: dict[str, Any] = Depends(_require_content_read),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Return paginated content items, optionally filtered by language/theme/type."""
    tenant_id = user.get("tenant_id") or user.get("tenantId", "")
    school_filter = _read_school_filter(user)

    base_query: dict = {"isDeleted": {"$ne": True}, "tenantId": tenant_id}
    if school_filter is not None:
        base_query["schoolId"] = school_filter

    # Fetch by specific IDs
    if ids is not None:
        if len(ids) == 0:
            raise HTTPException(status_code=400, detail="ids query parameter must be a non-empty array")
        id_query = {**base_query, "_id": {"$in": ids}}
        contents = await db["contentsV3"].find(id_query).to_list(length=None)
        quizzes = await db["quizdata"].find(id_query).to_list(length=None)
        all_items = sorted(
            [_fmt_content(d) for d in contents] + [_fmt_quiz(d) for d in quizzes],
            key=lambda x: (-x.get("creation_time", 0), str(x.get("_id", ""))),
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
        import urllib.parse  # noqa: PLC0415
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

    contents = await db["contentsV3"].find(content_query).sort("creation_time", -1).to_list(length=None) if fetch_content else []
    quizzes = await db["quizdata"].find(quiz_query).sort("creation_time", -1).to_list(length=None) if fetch_quizzes else []

    all_results = sorted(
        [_fmt_content(d) for d in contents] + [_fmt_quiz(d) for d in quizzes],
        key=lambda x: (-x.get("creation_time", 0), str(x.get("_id", ""))),
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
                     if x.get("creation_time") == last_ct and str(x.get("_id", "")) == last_id),
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
        f"{last_item['creation_time']}_{last_item['_id']}"
        if has_more and last_item
        else None
    )

    return {"data": data, "pagination": {"nextCursor": next_cursor, "hasMore": has_more, "limit": limit}}


# ---------------------------------------------------------------------------
# GET /content/{content_id}
# ---------------------------------------------------------------------------

@router.get("/content/{content_id}", summary="Get content by ID")
async def get_content(
    content_id: str,
    user: dict[str, Any] = Depends(_require_content_read),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Return a content item by ID, scoped to the authenticated tenant."""
    tenant_id = user.get("tenant_id") or user.get("tenantId", "")
    school_filter = _read_school_filter(user)

    query: dict = {
        "_id": content_id,
        "tenantId": tenant_id,
        "isDeleted": {"$ne": True},
    }
    if school_filter is not None:
        query["schoolId"] = school_filter

    doc = await db["contentsV3"].find_one(query)
    if doc:
        return _fmt_content(doc)

    quiz = await db["quizdata"].find_one(query)
    if quiz:
        return _fmt_quiz(quiz)

    raise NotFoundError("Content", content_id)


# ---------------------------------------------------------------------------
# POST /content — create + trigger job
# ---------------------------------------------------------------------------

@router.post("/content", summary="Create content and trigger processing job", status_code=201)
async def create_content(
    body: dict[str, Any],
    user: dict[str, Any] = Depends(_require_content_write),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Create a new content document and enqueue a processing job.

    Returns ``{"message": "...", "jobId": "..."}``.
    """
    tenant_id = user.get("tenant_id") or user.get("tenantId", "")
    user_id = user.get("sub", "")
    school_id = _write_school_filter(user)

    # Validate audio URLs
    for item in body.get("audioContent", []):
        au = item.get("audioUrl", "")
        if au and not au.lower().endswith(".mp3"):
            raise HTTPException(status_code=400, detail="Only .mp3 audio files are allowed.")

    content_id = str(uuid.uuid4())
    now_ts = int(time.time())
    doc: dict = {
        **body,
        "_id": content_id,
        "tenantId": tenant_id,
        "createdBy": user_id,
        "creation_time": now_ts,
        "schoolId": school_id,
        "isDeleted": False,
        "isProcessed": False,
        "created_at": datetime.now(timezone.utc),
    }

    await db["contentsV3"].insert_one(doc)
    job_id = await _enqueue_content_job(content_id, db)

    logger.info("content_controller: created content_id=%s job_id=%s", content_id, job_id)
    return {"message": "Processing New Content job scheduled!", "jobId": job_id}


# ---------------------------------------------------------------------------
# PATCH /content — update + optionally re-trigger job
# ---------------------------------------------------------------------------

@router.patch("/content", summary="Update content")
async def update_content(
    body: dict[str, Any],
    is_audio_uploaded: bool = Query(False, alias="isAudioUploaded"),
    user: dict[str, Any] = Depends(_require_content_write),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Update a content item. Re-triggers processing job if isAudioUploaded=true."""
    tenant_id = user.get("tenant_id") or user.get("tenantId", "")
    content_id = body.get("_id")
    if not content_id:
        raise HTTPException(status_code=400, detail="Content _id is required")

    school_filter = _write_school_filter(user)
    write_filter: dict = {
        "_id": content_id,
        "tenantId": tenant_id,
        "isDeleted": {"$ne": True},
    }
    if school_filter is not None:
        write_filter["schoolId"] = school_filter

    # Build update set
    allowed = {"title", "theme", "description", "type", "language", "isPullModel", "isTeacherApp"}
    update: dict = {k: v for k, v in body.items() if k in allowed}

    if is_audio_uploaded:
        for item in body.get("audioContent", []):
            au = item.get("audioUrl", "")
            if au and not au.lower().endswith(".mp3"):
                raise HTTPException(status_code=400, detail="Only .mp3 audio files are allowed.")
        if "audioContent" in body:
            update["audioContent"] = body["audioContent"]
        update["isProcessed"] = False

    update["updated_at"] = datetime.now(timezone.utc)

    result = await db["contentsV3"].find_one_and_update(
        write_filter, {"$set": update}, return_document=True
    )

    if result:
        if is_audio_uploaded:
            content_id_str = str(result.get("_id", ""))
            job_id = await _enqueue_content_job(content_id_str, db)
            out = _fmt_content(result)
            out["jobId"] = job_id
            return out
        return _fmt_content(result)

    raise NotFoundError("Content", str(content_id))


# ---------------------------------------------------------------------------
# PUT /content/{content_id}  (alias for PATCH for REST completeness)
# ---------------------------------------------------------------------------

@router.put("/content/{content_id}", summary="Replace/update content by ID")
async def put_content(
    content_id: str,
    body: dict[str, Any],
    user: dict[str, Any] = Depends(_require_content_write),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Full update of a content item by ID."""
    body["_id"] = content_id
    return await update_content(body=body, is_audio_uploaded=False, user=user, db=db)


# ---------------------------------------------------------------------------
# DELETE /content/{content_id}
# ---------------------------------------------------------------------------

@router.delete("/content/{content_id}", summary="Soft-delete content by ID")
async def delete_content(
    content_id: str,
    user: dict[str, Any] = Depends(_require_content_write),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> Any:
    """Soft-delete a content item (sets isDeleted=true)."""
    tenant_id = user.get("tenant_id") or user.get("tenantId", "")
    school_filter = _write_school_filter(user)

    write_filter: dict = {"_id": content_id, "tenantId": tenant_id}
    if school_filter is not None:
        write_filter["schoolId"] = school_filter

    result = await db["contentsV3"].update_one(write_filter, {"$set": {"isDeleted": True}})
    if result.matched_count > 0:
        return {"matched": result.matched_count, "modified": result.modified_count}

    quiz_result = await db["quizdata"].update_one(write_filter, {"$set": {"isDeleted": True}})
    if quiz_result.matched_count > 0:
        return {"matched": quiz_result.matched_count, "modified": quiz_result.modified_count}

    raise NotFoundError("Content", content_id)


# ---------------------------------------------------------------------------
# POST /content/quiz — create quiz + trigger job
# ---------------------------------------------------------------------------

@router.post("/content/quiz", summary="Create quiz and trigger processing job")
async def create_quiz(
    body: dict[str, Any],
    user: dict[str, Any] = Depends(_require_content_write),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Create a new quiz document and enqueue a processing job."""
    tenant_id = user.get("tenant_id") or user.get("tenantId", "")
    user_id = user.get("sub", "")
    school_id = _write_school_filter(user)

    quiz_id = str(uuid.uuid4())
    now_ts = int(time.time())
    doc: dict = {
        **body,
        "_id": quiz_id,
        "tenantId": tenant_id,
        "createdBy": user_id,
        "creation_time": now_ts,
        "schoolId": school_id,
        "isDeleted": False,
        "created_at": datetime.now(timezone.utc),
    }

    await db["quizdata"].insert_one(doc)
    job_id = await _enqueue_content_job(quiz_id, db)

    return {"message": "Processing New Content job scheduled!", "jobId": job_id}


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def _fmt_content(doc: dict) -> dict:
    d = dict(doc)
    if "_id" in d:
        d["id"] = str(d["_id"])
    return d


def _fmt_quiz(doc: dict) -> dict:
    d = dict(doc)
    if "_id" in d:
        d["id"] = str(d["_id"])
    d["type"] = "quiz"
    return d
