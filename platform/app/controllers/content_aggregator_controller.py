"""
Content aggregator controller — /content-aggregators/* endpoints for syncing
content from external sources. Subodha (Open edX) is the one concrete source
today, wired via SubodhaAdapter/SubodhaClient/SubodhaService.

Storage is the universal content_aggregators pipeline (source_type="subodha").
JSON responses are snake_case.
"""

from __future__ import annotations

import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse

from app.models.user import UserRole
from app.platform.auth.dependencies import get_current_user
from app.platform.error_handling import ConflictError, ForbiddenError, NotFoundError
from app.providers.service_bus import service_bus_provider
from app.providers.subodha_client import SubodhaClient, get_subodha_client
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
    get_content_aggregator_sync_job_item_repo,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
    get_content_aggregator_sync_job_repo,
)
from app.services.content_aggregator_sync_jobs import (
    create_job,
    serialize_job,
    subscribe,
)
from app.services.subodha_service import CourseDiffResult, SubodhaService, get_subodha_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content-aggregators", tags=["Content Aggregators"])

SOURCE_TYPE = "subodha"


async def _wake_sync_job_consumer(job_id: str) -> None:
    try:
        await service_bus_provider.send_sync_job({"job_id": job_id})
    except Exception as exc:  # noqa: BLE001
        logger.warning("Failed to publish sync_jobs wake message for job %s: %s", job_id, exc)


async def _require_tenant(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") != UserRole.TENANT.value:
        raise ForbiddenError("content aggregator sync is tenant-admin only")
    return user


_AGGREGATOR_ACCESS_ROLES = frozenset(
    {UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value}
)


async def _require_aggregator_access(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") not in _AGGREGATOR_ACCESS_ROLES:
        raise ForbiddenError("content aggregator access requires tenant, school admin, or content creator role")
    return user


@router.get("/diff", summary="Diff live Subodha courses against stored courses")
async def get_diff(
    user: dict[str, Any] = Depends(_require_tenant),
    service: SubodhaService = Depends(get_subodha_service),
    client: SubodhaClient = Depends(get_subodha_client),
) -> CourseDiffResult:
    return await service.get_course_diff(user.get("tenant_id", ""), client)


@router.post("/sync", status_code=202, summary="Start a full (or new-only) course sync")
async def start_sync(
    body: dict[str, Any] | None = None,
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
) -> dict[str, str]:
    body = body or {}
    tenant_id = user.get("tenant_id", "")
    active_jobs = await job_repo.get_active_jobs(tenant_id, source_type=SOURCE_TYPE)
    if any(j.scope == "all" for j in active_jobs):
        raise ConflictError("A Subodha sync-all job")
    options = {"only_new": bool(body.get("onlyNew", False)), "dry_run": bool(body.get("dryRun", False)), "limit": body.get("limit")}
    job = await create_job(
        job_repo, tenant_id=tenant_id, source_type=SOURCE_TYPE, scope="all", source_id=None, total_items=0, options=options,
    )
    await _wake_sync_job_consumer(job.job_id)
    return {"job_id": job.job_id}


@router.get("/courses", summary="List synced courses (cursor pagination)")
async def list_courses(
    limit: int = Query(20, ge=1, le=200),
    cursor: str | None = None,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    service: SubodhaService = Depends(get_subodha_service),
) -> dict[str, Any]:
    all_courses = await service.get_content_list(user.get("tenant_id", ""), cursor=cursor, limit=limit)
    has_more = len(all_courses) > limit
    courses = all_courses[:limit]
    next_cursor = courses[-1]["id"] if has_more and courses else None
    return {"courses": courses, "next_cursor": next_cursor, "has_more": has_more}


@router.get("/courses/{course_id}", summary="Get a synced course's full content (blocks) for viewing")
async def get_course(
    course_id: str,
    user: dict[str, Any] = Depends(_require_aggregator_access),
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
    body: dict[str, Any] | None = None,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
) -> dict[str, str]:
    body = body or {}
    tenant_id = user.get("tenant_id", "")
    active_jobs = await job_repo.get_active_jobs(tenant_id, source_type=SOURCE_TYPE)
    if any(j.scope == "course" and j.source_id == course_id for j in active_jobs):
        raise ConflictError(f'A sync for course "{course_id}"')
    options = {"dry_run": bool(body.get("dryRun", False))}
    job = await create_job(
        job_repo, tenant_id=tenant_id, source_type=SOURCE_TYPE, scope="course", source_id=course_id, total_items=1, options=options,
    )
    await _wake_sync_job_consumer(job.job_id)
    return {"job_id": job.job_id}


@router.get("/sync/status/{job_id}", summary="Get sync job status")
async def get_sync_status(
    job_id: str,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
    item_repo: ContentAggregatorSyncJobItemRepository = Depends(get_content_aggregator_sync_job_item_repo),
) -> dict[str, Any]:
    tenant_id = user.get("tenant_id", "")
    job = await job_repo.get_job(tenant_id, job_id)
    if job is None:
        raise NotFoundError("Job", job_id)
    stats = await item_repo.get_stats(tenant_id, job_id)
    return serialize_job(job, stats)


@router.get("/sync/status/{job_id}/items", summary="Paginated per-item sync results for a job")
async def get_sync_job_items(
    job_id: str,
    limit: int = Query(20, ge=1, le=200),
    after: str | None = None,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
    item_repo: ContentAggregatorSyncJobItemRepository = Depends(get_content_aggregator_sync_job_item_repo),
) -> dict[str, Any]:
    tenant_id = user.get("tenant_id", "")
    job = await job_repo.get_job(tenant_id, job_id)
    if job is None:
        raise NotFoundError("Job", job_id)
    items, next_cursor, total = await item_repo.list_by_job_page(tenant_id, job_id, limit=limit, after=after)
    return {"items": [i.to_doc() for i in items], "next_cursor": next_cursor, "total": total}


@router.get("/sync/jobs", summary="List past sync jobs (history)")
async def get_sync_jobs(
    limit: int = Query(20, ge=1, le=200),
    scope: str | None = None,
    course_id: str | None = None,
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
    item_repo: ContentAggregatorSyncJobItemRepository = Depends(get_content_aggregator_sync_job_item_repo),
) -> dict[str, Any]:
    tenant_id = user.get("tenant_id", "")
    job_list = await job_repo.list_jobs(tenant_id, SOURCE_TYPE, limit=limit, scope=scope, source_id=course_id)
    payloads = []
    for j in job_list:
        stats = await item_repo.get_stats(tenant_id, j.job_id)
        payloads.append(serialize_job(j, stats))
    return {"jobs": payloads}


@router.get("/sync/jobs/active", summary="List currently-running sync jobs (for resume after logout/login)")
async def get_active_jobs(
    user: dict[str, Any] = Depends(_require_tenant),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
    item_repo: ContentAggregatorSyncJobItemRepository = Depends(get_content_aggregator_sync_job_item_repo),
) -> dict[str, Any]:
    tenant_id = user.get("tenant_id", "")
    jobs = await job_repo.get_active_jobs(tenant_id, SOURCE_TYPE)
    payloads = []
    for j in jobs:
        stats = await item_repo.get_stats(tenant_id, j.job_id)
        payloads.append(serialize_job(j, stats))
    return {"jobs": payloads}


@router.get("/sync/stream/{job_id}", summary="SSE stream of live job progress")
async def stream_job(
    job_id: str,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
    item_repo: ContentAggregatorSyncJobItemRepository = Depends(get_content_aggregator_sync_job_item_repo),
) -> StreamingResponse:
    tenant_id = user.get("tenant_id", "")

    async def _format() -> Any:
        async for event in subscribe(job_repo, item_repo, tenant_id, job_id):
            yield f"data: {json.dumps(event, default=str)}\n\n"

    return StreamingResponse(_format(), media_type="text/event-stream")
