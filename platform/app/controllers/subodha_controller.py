"""
Subodha controller — /subodha/* endpoints for syncing Subodha (Open edX) courses.

Ported from subodha/backend/src/server.ts. Preserves original route shapes.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any

import httpx
from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse

from app.models.user import UserRole
from app.platform.auth.dependencies import get_current_user
from app.platform.error_handling import ForbiddenError, NotFoundError
from app.platform.settings import get_settings
from app.providers.subodha_client import SubodhaClient, get_subodha_client
from app.repositories.subodha_job_repository import SubodhaJobRepository, get_subodha_job_repo
from app.services.subodha_jobs import create_job, finish_job, serialize_job, subscribe
from app.services.subodha_service import SubodhaService, get_subodha_service

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
    job_repo: SubodhaJobRepository,
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
            await _post_webhook(webhook_url, {"event": "diffing", "jobId": job_id, **diff})

        result = await service.run_sync(
            client,
            job_repo,
            job_id,
            course_ids=course_ids,
            limit=limit if limit is not None else (len(course_ids) if course_ids is not None else None),
            dry_run=dry_run,
        )
        await finish_job(job_repo, job_id, "completed")
        await _post_webhook(webhook_url, {"event": "completed", "jobId": job_id, **result})
    except Exception as exc:  # noqa: BLE001
        await finish_job(job_repo, job_id, "failed", error=str(exc))
        await _post_webhook(webhook_url, {"event": "failed", "jobId": job_id, "error": str(exc)})


async def _run_course_sync_job(
    job_id: str,
    service: SubodhaService,
    client: SubodhaClient,
    job_repo: SubodhaJobRepository,
    course_id: str,
    *,
    dry_run: bool,
    webhook_url: str | None,
) -> None:
    try:
        result = await service.run_single_course_sync(client, job_repo, job_id, course_id, dry_run=dry_run)
        await finish_job(job_repo, job_id, "completed")
        await _post_webhook(webhook_url, {"event": "completed", "jobId": job_id, "courseId": course_id, **result})
    except Exception as exc:  # noqa: BLE001
        await finish_job(job_repo, job_id, "failed", error=str(exc))
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
    job_repo: SubodhaJobRepository = Depends(get_subodha_job_repo),
) -> dict[str, str]:
    body = body or {}
    job = await create_job(job_repo, scope="all", course_id=None, total_courses=0)
    background_tasks.add_task(
        _run_sync_job,
        job["_id"],
        service,
        client,
        job_repo,
        only_new=bool(body.get("onlyNew", False)),
        dry_run=bool(body.get("dryRun", False)),
        webhook_url=body.get("webhookUrl"),
        limit=body.get("limit"),
    )
    return {"jobId": job["_id"]}


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
    job_repo: SubodhaJobRepository = Depends(get_subodha_job_repo),
) -> dict[str, str]:
    body = body or {}
    job = await create_job(job_repo, scope="course", course_id=course_id, total_courses=1)
    background_tasks.add_task(
        _run_course_sync_job,
        job["_id"],
        service,
        client,
        job_repo,
        course_id,
        dry_run=bool(body.get("dryRun", False)),
        webhook_url=body.get("webhookUrl"),
    )
    return {"jobId": job["_id"]}


@router.get("/sync/status/{job_id}", summary="Get sync job status")
async def get_sync_status(
    job_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: SubodhaJobRepository = Depends(get_subodha_job_repo),
) -> dict[str, Any]:
    job = await job_repo.get_job(job_id)
    if job is None:
        raise NotFoundError("Job", job_id)
    return serialize_job(job)


@router.get("/sync/jobs", summary="List past sync jobs (history)")
async def get_sync_jobs(
    limit: int = 20,
    scope: str | None = None,
    course_id: str | None = None,
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: SubodhaJobRepository = Depends(get_subodha_job_repo),
) -> dict[str, Any]:
    jobs = await job_repo.list_jobs(limit=limit, scope=scope, course_id=course_id)
    return {"jobs": [serialize_job(j) for j in jobs]}


@router.get("/sync/jobs/active", summary="List currently-running sync jobs (for resume after logout/login)")
async def get_active_jobs(
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: SubodhaJobRepository = Depends(get_subodha_job_repo),
) -> dict[str, Any]:
    jobs = await job_repo.get_active_jobs()
    return {"jobs": [serialize_job(j) for j in jobs]}


@router.get("/sync/stream/{job_id}", summary="SSE stream of live job progress")
async def stream_job(
    job_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: SubodhaJobRepository = Depends(get_subodha_job_repo),
) -> StreamingResponse:
    async def _format() -> Any:
        async for event in subscribe(job_repo, job_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(_format(), media_type="text/event-stream")
