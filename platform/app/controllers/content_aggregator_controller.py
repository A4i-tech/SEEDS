"""
Content aggregator controller — /content-aggregators/* endpoints for syncing
content from external sources. Subodha (Open edX) is the one concrete source
today, wired via SubodhaAdapter/SubodhaClient/SubodhaService.

Storage is the universal content_aggregators pipeline (source_type="subodha").
JSON responses are snake_case.
"""

from __future__ import annotations

import json
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends
from fastapi.responses import StreamingResponse

from app.models.user import UserRole
from app.platform.auth.dependencies import get_current_user
from app.platform.error_handling import ForbiddenError, NotFoundError
from app.providers.subodha_client import SubodhaClient, get_subodha_client
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
    get_content_aggregator_sync_job_repo,
)
from app.services.content_aggregator_sync_jobs import create_job, finish_job, serialize_job, subscribe
from app.services.subodha_service import SubodhaService, get_subodha_service

router = APIRouter(prefix="/content-aggregators", tags=["Content Aggregators"])

SOURCE_TYPE = "subodha"


async def _require_tenant(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") != UserRole.TENANT.value:
        raise ForbiddenError("content aggregator sync is tenant-admin only")
    return user


async def _run_sync_job(
    tenant_id: str,
    job_id: str,
    service: SubodhaService,
    client: SubodhaClient,
    job_repo: ContentAggregatorSyncJobRepository,
    *,
    only_new: bool,
    dry_run: bool,
    limit: int | None,
) -> None:
    try:
        course_ids = None
        if only_new:
            diff = await service.get_course_diff(tenant_id, client)
            course_ids = diff["newCourseIds"]

        await service.run_sync(
            tenant_id, client, job_repo, job_id, course_ids=course_ids,
            limit=limit if limit is not None else (len(course_ids) if course_ids is not None else None),
            dry_run=dry_run,
        )
        await finish_job(job_repo, tenant_id, job_id, "completed")
    except Exception as exc:  # noqa: BLE001
        await finish_job(job_repo, tenant_id, job_id, "failed", error=str(exc))


async def _run_course_sync_job(
    tenant_id: str,
    job_id: str,
    service: SubodhaService,
    client: SubodhaClient,
    job_repo: ContentAggregatorSyncJobRepository,
    course_id: str,
    *,
    dry_run: bool,
) -> None:
    try:
        await service.run_single_course_sync(tenant_id, client, job_repo, job_id, course_id, dry_run=dry_run)
        await finish_job(job_repo, tenant_id, job_id, "completed")
    except Exception as exc:  # noqa: BLE001
        await finish_job(job_repo, tenant_id, job_id, "failed", error=str(exc))


@router.get("/diff", summary="Diff live Subodha courses against stored courses")
async def get_diff(
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
    client: SubodhaClient = Depends(get_subodha_client),
) -> dict[str, Any]:
    return await service.get_course_diff(user.get("tenant_id", ""), client)


@router.post("/sync", status_code=202, summary="Start a full (or new-only) course sync")
async def start_sync(
    background_tasks: BackgroundTasks,
    body: dict[str, Any] | None = None,
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
    client: SubodhaClient = Depends(get_subodha_client),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
) -> dict[str, str]:
    body = body or {}
    tenant_id = user.get("tenant_id", "")
    job = await create_job(job_repo, tenant_id=tenant_id, source_type=SOURCE_TYPE, scope="all", source_id=None, total_items=0)
    background_tasks.add_task(
        _run_sync_job, tenant_id, job.job_id, service, client, job_repo,
        only_new=bool(body.get("onlyNew", False)), dry_run=bool(body.get("dryRun", False)), limit=body.get("limit"),
    )
    return {"job_id": job.job_id}


@router.get("/courses", summary="List synced courses")
async def list_courses(
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
) -> dict[str, Any]:
    return {"courses": await service.get_content_list(user.get("tenant_id", ""))}


@router.get("/courses/{course_id}", summary="Get a synced course's full content (blocks) for viewing")
async def get_course(
    course_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
) -> dict[str, Any]:
    doc = await service.get_course(user.get("tenant_id", ""), course_id)
    if doc is None:
        raise NotFoundError("Subodha course", course_id)
    return doc.to_dict()


@router.delete("/courses/{course_id}", summary="Delete a synced course's local copy (does not touch Subodha)")
async def delete_course(
    course_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
) -> dict[str, int]:
    deleted = await service.delete_course(user.get("tenant_id", ""), course_id)
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
        user.get("tenant_id", ""), course_id, block_id, body.get("question", ""), body.get("choices", [])
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
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
) -> dict[str, str]:
    body = body or {}
    tenant_id = user.get("tenant_id", "")
    job = await create_job(job_repo, tenant_id=tenant_id, source_type=SOURCE_TYPE, scope="course", source_id=course_id, total_items=1)
    background_tasks.add_task(
        _run_course_sync_job, tenant_id, job.job_id, service, client, job_repo, course_id, dry_run=bool(body.get("dryRun", False))
    )
    return {"job_id": job.job_id}


@router.get("/sync/status/{job_id}", summary="Get sync job status")
async def get_sync_status(
    job_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
) -> dict[str, Any]:
    job = await job_repo.get_job(user.get("tenant_id", ""), job_id)
    if job is None:
        raise NotFoundError("Job", job_id)
    return serialize_job(job)


@router.get("/sync/jobs", summary="List past sync jobs (history)")
async def get_sync_jobs(
    limit: int = 20,
    scope: str | None = None,
    course_id: str | None = None,
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
) -> dict[str, Any]:
    jobs = await job_repo.list_jobs(user.get("tenant_id", ""), SOURCE_TYPE, limit=limit, scope=scope, source_id=course_id)
    return {"jobs": [serialize_job(j) for j in jobs]}


@router.get("/sync/jobs/active", summary="List currently-running sync jobs (for resume after logout/login)")
async def get_active_jobs(
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
) -> dict[str, Any]:
    jobs = await job_repo.get_active_jobs(user.get("tenant_id", ""), SOURCE_TYPE)
    return {"jobs": [serialize_job(j) for j in jobs]}


@router.get("/sync/stream/{job_id}", summary="SSE stream of live job progress")
async def stream_job(
    job_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
) -> StreamingResponse:
    tenant_id = user.get("tenant_id", "")

    async def _format() -> Any:
        async for event in subscribe(job_repo, tenant_id, job_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(_format(), media_type="text/event-stream")
