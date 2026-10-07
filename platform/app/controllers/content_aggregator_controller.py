"""
Content aggregator controller — /content-aggregators/* endpoints for syncing
content from external sources. Subodha (Open edX) is the one concrete source
today, wired via SubodhaAdapter/SubodhaClient/SubodhaService.

Storage is the universal content_aggregators pipeline (source_type="subodha").
JSON responses are snake_case.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncIterator, Callable
from typing import Any

from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.models import SourceType
from app.aggregators.sync_job_models import SyncOptions, SyncScope
from app.models.requests.content_aggregator_sync_requests import (
    ProblemBlockEditRequest,
    SyncAllRequest,
    SyncCourseRequest,
)
from app.models.responses.content_aggregator import (
    CourseListResponse,
    DeletedCountResponse,
    ModifiedCountResponse,
    SyncAllJobsResponse,
    SyncJobIdResponse,
    SyncJobItemsPageResponse,
    SyncJobListResponse,
    SyncJobResponse,
)
from app.models.user import UserRole
from app.platform.auth.dependencies import get_current_user, get_db
from app.platform.error_handling import ConflictError, ForbiddenError, NotFoundError
from app.providers.service_bus import service_bus_provider
from app.serializers.subodha_serializer import LegacyCourseDoc
from app.services.content_aggregator_source_service import (
    ContentAggregatorSourceService,
    CourseDiffResult,
    LiveCourse,
)
from app.services.content_aggregator_sync_jobs import SyncJobService, get_sync_job_service
from app.services.hexis_service import get_hexis_service
from app.services.subodha_service import get_subodha_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content-aggregators", tags=["Content Aggregators"])

_SERVICE_FACTORIES: dict[SourceType, Callable[[AsyncDatabase], ContentAggregatorSourceService]] = {
    SourceType.SUBODHA: get_subodha_service,
    SourceType.HEXIS: get_hexis_service,
}


def _valid_source(source: str) -> SourceType:
    try:
        return SourceType(source)
    except ValueError:
        raise NotFoundError("content aggregator source", source) from None


def _source_service(
    source: SourceType = Depends(_valid_source), db: AsyncDatabase = Depends(get_db)
) -> ContentAggregatorSourceService:
    return _SERVICE_FACTORIES[source](db)


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


async def _assert_no_active_all_sync(sync_jobs: SyncJobService, tenant_id: str, source: SourceType) -> None:
    if await sync_jobs.has_active_all_sync(tenant_id, source):
        raise ConflictError(f"A {source} sync-all job")


async def _enqueue_all_sync(
    sync_jobs: SyncJobService, tenant_id: str, source: SourceType, body: SyncAllRequest
) -> str:
    job = await sync_jobs.create_job(
        tenant_id=tenant_id, source_type=source, scope=SyncScope.ALL, source_id="", total_items=0,
        options=SyncOptions(only_new=body.only_new, dry_run=body.dry_run, limit=body.limit),
    )
    await _wake_sync_job_consumer(job.job_id)
    return job.job_id


@router.get("/{source}/diff", summary="Diff live courses against stored courses for a source")
async def get_diff(
    user: dict[str, Any] = Depends(_require_tenant),
    service: ContentAggregatorSourceService = Depends(_source_service),
) -> CourseDiffResult[LiveCourse]:
    return await service.get_course_diff(user["tenant_id"])


@router.post("/sync", status_code=202, summary="Start a full (or new-only) sync on every source")
async def start_sync_all_sources(
    body: SyncAllRequest,
    user: dict[str, Any] = Depends(_require_tenant),
    sync_jobs: SyncJobService = Depends(get_sync_job_service),
) -> SyncAllJobsResponse:
    tenant_id = user["tenant_id"]
    for source in _SERVICE_FACTORIES:
        await _assert_no_active_all_sync(sync_jobs, tenant_id, source)
    return SyncAllJobsResponse(
        job_ids={source: await _enqueue_all_sync(sync_jobs, tenant_id, source, body) for source in _SERVICE_FACTORIES}
    )


@router.post("/{source}/sync", status_code=202, summary="Start a full (or new-only) course sync for a source")
async def start_sync(
    body: SyncAllRequest,
    source: SourceType = Depends(_valid_source),
    user: dict[str, Any] = Depends(_require_tenant),
    sync_jobs: SyncJobService = Depends(get_sync_job_service),
) -> SyncJobIdResponse:
    tenant_id = user["tenant_id"]
    await _assert_no_active_all_sync(sync_jobs, tenant_id, source)
    return SyncJobIdResponse(job_id=await _enqueue_all_sync(sync_jobs, tenant_id, source, body))


@router.get("/{source}/courses", summary="List synced courses for a source (cursor pagination)")
async def list_courses(
    limit: int = Query(20, ge=1, le=200),
    cursor: str = "",
    user: dict[str, Any] = Depends(_require_aggregator_access),
    service: ContentAggregatorSourceService = Depends(_source_service),
) -> CourseListResponse:
    all_courses = await service.get_content_list(user["tenant_id"], cursor=cursor, limit=limit)
    has_more = len(all_courses) > limit
    courses = all_courses[:limit]
    return CourseListResponse(
        courses=courses, next_cursor=courses[-1].id if has_more else "", has_more=has_more
    )


@router.get("/{source}/courses/{course_id}", summary="Get a synced course's full content (blocks) for viewing")
async def get_course(
    course_id: str,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    service: ContentAggregatorSourceService = Depends(_source_service),
) -> LegacyCourseDoc:
    return await service.get_course(user["tenant_id"], course_id)


@router.delete("/{source}/courses/{course_id}", summary="Delete a synced course's local copy (does not touch the source)")
async def delete_course(
    course_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    service: ContentAggregatorSourceService = Depends(_source_service),
) -> DeletedCountResponse:
    return DeletedCountResponse(deleted=await service.delete_course(user["tenant_id"], course_id))


@router.patch(
    "/{source}/courses/{course_id}/blocks/{block_id}",
    summary="Edit a problem block's question/choices in place (overwritten by the next sync)",
)
async def update_problem_block(
    course_id: str,
    block_id: str,
    body: ProblemBlockEditRequest,
    user: dict[str, Any] = Depends(_require_tenant),
    service: ContentAggregatorSourceService = Depends(_source_service),
) -> ModifiedCountResponse:
    await service.update_problem_block(
        user["tenant_id"], course_id, block_id, body.question, [choice.model_dump() for choice in body.choices]
    )
    return ModifiedCountResponse(modified=1)


@router.post("/{source}/sync/course/{course_id}", status_code=202, summary="Sync a single course")
async def sync_course(
    course_id: str,
    body: SyncCourseRequest,
    source: SourceType = Depends(_valid_source),
    user: dict[str, Any] = Depends(_require_aggregator_access),
    sync_jobs: SyncJobService = Depends(get_sync_job_service),
) -> SyncJobIdResponse:
    tenant_id = user["tenant_id"]
    if await sync_jobs.has_active_course_sync(tenant_id, source, course_id):
        raise ConflictError(f'A sync for course "{course_id}"')
    job = await sync_jobs.create_job(
        tenant_id=tenant_id, source_type=source, scope=SyncScope.COURSE, source_id=course_id, total_items=1,
        options=SyncOptions(dry_run=body.dry_run),
    )
    await _wake_sync_job_consumer(job.job_id)
    return SyncJobIdResponse(job_id=job.job_id)


@router.get("/sync/status/{job_id}", summary="Get sync job status")
async def get_sync_status(
    job_id: str,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    sync_jobs: SyncJobService = Depends(get_sync_job_service),
) -> SyncJobResponse:
    return await sync_jobs.get_job_status(user["tenant_id"], job_id)


@router.get("/sync/status/{job_id}/items", summary="Paginated per-item sync results for a job")
async def get_sync_job_items(
    job_id: str,
    limit: int = Query(20, ge=1, le=200),
    after: str = "",
    user: dict[str, Any] = Depends(_require_aggregator_access),
    sync_jobs: SyncJobService = Depends(get_sync_job_service),
) -> SyncJobItemsPageResponse:
    items, next_cursor, total = await sync_jobs.get_job_items_page(user["tenant_id"], job_id, limit=limit, after=after)
    return SyncJobItemsPageResponse(items=items, next_cursor=next_cursor, total=total)


@router.get("/sync/jobs", summary="List past sync jobs (history)")
async def get_sync_jobs(
    limit: int = Query(20, ge=1, le=200),
    scope: SyncScope | None = None,
    course_id: str = "",
    user: dict[str, Any] = Depends(_require_tenant),
    sync_jobs: SyncJobService = Depends(get_sync_job_service),
) -> SyncJobListResponse:
    jobs = await sync_jobs.list_jobs_with_stats(
        user["tenant_id"], None, limit=limit, scope=scope, source_id=course_id,
    )
    return SyncJobListResponse(jobs=jobs)


@router.get("/sync/jobs/active", summary="List currently-running sync jobs (for resume after logout/login)")
async def get_active_jobs(
    user: dict[str, Any] = Depends(_require_tenant),
    sync_jobs: SyncJobService = Depends(get_sync_job_service),
) -> SyncJobListResponse:
    return SyncJobListResponse(jobs=await sync_jobs.get_active_jobs_with_stats(user["tenant_id"], None))


@router.get("/sync/stream/{job_id}", summary="SSE stream of live job progress")
async def stream_job(
    job_id: str,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    sync_jobs: SyncJobService = Depends(get_sync_job_service),
) -> StreamingResponse:
    tenant_id = user["tenant_id"]

    async def _format() -> AsyncIterator[str]:
        async for event in sync_jobs.subscribe(tenant_id, job_id):
            yield f"data: {event.model_dump_json()}\n\n"

    return StreamingResponse(_format(), media_type="text/event-stream")
