"""
Subodha controller — /subodha/* endpoints for syncing Subodha (Open edX) courses.

Ported from subodha/backend/src/server.ts. Preserves original route shapes.
"""

from __future__ import annotations

import logging
import time
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends

from app.models.user import UserRole
from app.platform.auth.dependencies import get_current_user
from app.platform.error_handling import ForbiddenError, NotFoundError
from app.platform.settings import get_settings
from app.providers.subodha_client import SubodhaClient, get_subodha_client
from app.services.subodha_service import (
    SubodhaService,
    create_job,
    get_job,
    get_subodha_service,
    list_jobs,
    update_job,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/subodha", tags=["Subodha"])

_last_webhook_at = 0.0


async def _require_tenant(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") != UserRole.TENANT.value:
        raise ForbiddenError("subodha sync is tenant-admin only")
    return user


async def _post_webhook(webhook_url: str | None, payload: dict[str, Any]) -> None:
    global _last_webhook_at  # noqa: PLW0603
    if not webhook_url:
        return
    now = time.monotonic()
    min_interval = get_settings().subodha_webhook_min_interval_ms / 1000
    if now - _last_webhook_at < min_interval and payload.get("event") == "progress":
        return
    _last_webhook_at = now
    try:
        async with httpx.AsyncClient(timeout=10.0) as http:
            await http.post(webhook_url, json=payload)
    except httpx.HTTPError as exc:
        logger.warning("[subodha] webhook POST failed: %s", exc)


async def _run_sync_job(
    job_id: str,
    service: SubodhaService,
    client: SubodhaClient,
    *,
    only_new: bool,
    dry_run: bool,
    webhook_url: str | None,
    limit: int | None,
) -> None:
    try:
        course_ids = None
        if only_new:
            diff = await service.get_course_diff(client)
            course_ids = diff["newCourseIds"]
            update_job(job_id, {"diff": diff})
            await _post_webhook(webhook_url, {"event": "diffing", "jobId": job_id, **diff})

        async def on_progress(progress: dict[str, Any]) -> None:
            update_job(job_id, {"progress": progress})
            await _post_webhook(webhook_url, {"event": "progress", "jobId": job_id, **progress})

        result = await service.run_sync(
            client,
            course_ids=course_ids,
            limit=limit if limit is not None else (len(course_ids) if course_ids is not None else None),
            dry_run=dry_run,
            run_id=job_id,
            on_progress=on_progress,
        )
        update_job(job_id, {"status": "completed", "finishedAt": result["finishedAt"], "result": result})
        await _post_webhook(webhook_url, {"event": "completed", "jobId": job_id, **result})
    except Exception as exc:  # noqa: BLE001
        update_job(job_id, {"status": "failed", "finishedAt": datetime.now(UTC).isoformat(), "error": str(exc)})
        await _post_webhook(webhook_url, {"event": "failed", "jobId": job_id, "error": str(exc)})


async def _run_course_sync_job(
    job_id: str,
    service: SubodhaService,
    client: SubodhaClient,
    course_id: str,
    *,
    dry_run: bool,
    webhook_url: str | None,
) -> None:
    try:
        result = await service.run_single_course_sync(client, course_id, dry_run=dry_run, run_id=job_id)
        update_job(job_id, {"status": "completed", "finishedAt": result["finishedAt"], "result": result})
        await _post_webhook(webhook_url, {"event": "completed", "jobId": job_id, "courseId": course_id, **result})
    except Exception as exc:  # noqa: BLE001
        update_job(job_id, {"status": "failed", "finishedAt": datetime.now(UTC).isoformat(), "error": str(exc)})
        await _post_webhook(webhook_url, {"event": "failed", "jobId": job_id, "courseId": course_id, "error": str(exc)})


@router.get("/diff", summary="Diff live Subodha courses against stored courses")
async def get_diff(
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
    client: SubodhaClient = Depends(get_subodha_client),
) -> dict[str, Any]:
    return await service.get_course_diff(client)


@router.post("/sync", status_code=202, summary="Start a full (or new-only) course sync")
async def start_sync(
    background_tasks: BackgroundTasks,
    body: dict[str, Any] | None = None,
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
    client: SubodhaClient = Depends(get_subodha_client),
) -> dict[str, str]:
    body = body or {}
    job = create_job()
    background_tasks.add_task(
        _run_sync_job,
        job["id"],
        service,
        client,
        only_new=bool(body.get("onlyNew", False)),
        dry_run=bool(body.get("dryRun", False)),
        webhook_url=body.get("webhookUrl"),
        limit=body.get("limit"),
    )
    return {"jobId": job["id"]}


@router.get("/courses", summary="List synced courses")
async def list_courses(
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
) -> dict[str, Any]:
    return {"courses": await service.get_content_list()}


@router.get("/courses/{course_id}", summary="Get a synced course's full content (blocks) for viewing")
async def get_course(
    course_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
) -> dict[str, Any]:
    doc = await service.get_course(course_id)
    if doc is None:
        raise NotFoundError("Subodha course", course_id)
    doc.pop("_id", None)
    return doc


@router.delete("/courses/{course_id}", summary="Delete a synced course's local copy (does not touch Subodha)")
async def delete_course(
    course_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
) -> dict[str, int]:
    deleted = await service.delete_course(course_id)
    if not deleted:
        raise NotFoundError("Subodha course", course_id)
    return {"deleted": deleted}


@router.patch(
    "/courses/{course_id}/blocks/{block_id}",
    summary="Edit a problem block's question/choices in place (overwritten by the next sync)",
)
async def update_problem_block(
    course_id: str,
    block_id: str,
    body: dict[str, Any],
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
) -> dict[str, int]:
    modified = await service.update_problem_block(
        course_id,
        block_id,
        body.get("question", ""),
        body.get("choices", []),
    )
    if not modified:
        raise NotFoundError("Subodha block", block_id)
    return {"modified": modified}


@router.post("/sync/course/{course_id}", status_code=202, summary="Sync a single course")
async def sync_course(
    course_id: str,
    background_tasks: BackgroundTasks,
    body: dict[str, Any] | None = None,
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
    client: SubodhaClient = Depends(get_subodha_client),
) -> dict[str, str]:
    body = body or {}
    job = create_job()
    background_tasks.add_task(
        _run_course_sync_job,
        job["id"],
        service,
        client,
        course_id,
        dry_run=bool(body.get("dryRun", False)),
        webhook_url=body.get("webhookUrl"),
    )
    return {"jobId": job["id"]}


@router.get("/sync/status/{job_id}", summary="Get sync job status")
async def get_sync_status(job_id: str, user: dict[str, Any] = Depends(_require_tenant)) -> dict[str, Any]:
    job = get_job(job_id)
    if job is None:
        raise NotFoundError("Job", job_id)
    return job


@router.get("/sync/jobs", summary="List tracked sync jobs")
async def get_sync_jobs(user: dict[str, Any] = Depends(_require_tenant)) -> list[dict[str, Any]]:
    return list_jobs()
