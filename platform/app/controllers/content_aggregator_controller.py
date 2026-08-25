"""
Content aggregator controller — /content-aggregators/* endpoints.

Sync is combined across ALL registered sources via a single source-less
`POST /sync` (parallel fan-out, one job). Job status/stream/history are
source-agnostic (keyed by job_id). Course-level reads/writes stay per-source
under `/{source}/...` since a course belongs to exactly one source.

Sources are resolved through _SOURCES; Subodha (Open edX) and Hexis (braille
LMS) are wired today. Access is granted to tenant admins, school admins, and
content creators. JSON responses are snake_case.
"""

from __future__ import annotations

import asyncio
import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, Query
from fastapi.responses import StreamingResponse
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.source_types import PlannedSource, SourceBinding
from app.aggregators.sync_job_models import SyncItemResult
from app.models.user import UserRole
from app.platform.auth.dependencies import get_current_user, get_db
from app.platform.error_handling import ConflictError, ForbiddenError, NotFoundError
from app.providers.hexis_client import get_hexis_client
from app.providers.subodha_client import get_subodha_client
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
    finish_job,
    record_item_result,
    serialize_job,
    set_total,
    subscribe,
)
from app.services.hexis_service import HexisService
from app.services.subodha_service import SubodhaService

router = APIRouter(prefix="/content-aggregators", tags=["Content Aggregators"])

_SOURCES = {
    "subodha": (SubodhaService, get_subodha_client),
    "hexis": (HexisService, get_hexis_client),
}

_AGGREGATOR_ACCESS_ROLES = frozenset(
    {UserRole.TENANT.value, UserRole.SCHOOL_ADMIN.value, UserRole.CONTENT_CREATOR.value}
)


def _resolve(source: str, db: AsyncDatabase):
    if source not in _SOURCES:
        raise NotFoundError("content aggregator source", source)
    service_cls, client_factory = _SOURCES[source]
    return service_cls(db), client_factory()


async def _require_aggregator_access(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") not in _AGGREGATOR_ACCESS_ROLES:
        raise ForbiddenError("content aggregator access requires tenant, school admin, or content creator role")
    return user


async def _require_tenant(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
    if user.get("role") != UserRole.TENANT.value:
        raise ForbiddenError("this operation is tenant-admin only")
    return user


async def _run_all_sources_sync_job(
    tenant_id: str,
    job_id: str,
    bindings: list[SourceBinding],
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    *,
    only_new: bool,
    dry_run: bool,
    limit: int | None,
) -> None:
    """Sync every registered source into one combined job.

    Sources are collected and processed in parallel, and each source is
    fault-isolated: one source failing (bad creds, unreachable LMS) is recorded
    as a single failed item and never aborts the others or the job."""

    async def _record_source_failure(binding: SourceBinding, exc: Exception) -> None:
        src = getattr(binding.service, "SOURCE_TYPE", "unknown")
        await record_item_result(
            job_repo, item_repo, tenant_id, job_id,
            SyncItemResult(source_id=src, name=src, status="failed", error=str(exc), at=datetime.now(UTC).isoformat()),
        )

    try:
        async def collect(binding: SourceBinding) -> PlannedSource:
            course_ids = None
            if only_new:
                diff = await binding.service.get_course_diff(tenant_id, binding.client)
                course_ids = diff["newCourseIds"]
            collected = await binding.service.collect_units(binding.client, course_ids=course_ids, limit=limit)
            return PlannedSource(binding=binding, session=collected.session, units=collected.units)

        results = await asyncio.gather(*(collect(b) for b in bindings), return_exceptions=True)
        planned = [r for r in results if isinstance(r, PlannedSource)]
        failed = [(b, r) for b, r in zip(bindings, results, strict=True) if isinstance(r, Exception)]

        await set_total(job_repo, item_repo, tenant_id, job_id, sum(len(p.units) for p in planned) + len(failed))
        for binding, exc in failed:
            await _record_source_failure(binding, exc)

        async def run_one(p: PlannedSource) -> None:
            try:
                await p.binding.service.sync_units(
                    tenant_id, p.binding.client, job_repo, item_repo, job_id, p.session, p.units, dry_run=dry_run
                )
            except Exception as exc:  # noqa: BLE001
                await _record_source_failure(p.binding, exc)

        await asyncio.gather(*(run_one(p) for p in planned))
        await finish_job(job_repo, item_repo, tenant_id, job_id, "completed")
    except Exception as exc:  # noqa: BLE001
        await finish_job(job_repo, item_repo, tenant_id, job_id, "failed", error=str(exc))


@router.post("/sync", status_code=202, summary="Start a combined sync across ALL sources (parallel)")
async def start_sync_all(
    background_tasks: BackgroundTasks,
    body: dict[str, Any] | None = None,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    db: AsyncDatabase = Depends(get_db),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
    item_repo: ContentAggregatorSyncJobItemRepository = Depends(get_content_aggregator_sync_job_item_repo),
) -> dict[str, str]:
    body = body or {}
    tenant_id = user.get("tenant_id", "")
    active_jobs = await job_repo.get_active_jobs(tenant_id, source_type="all")
    if active_jobs:
        raise ConflictError("A combined sync-all job")
    bindings = [
        SourceBinding(service=service_cls(db), client=client_factory())
        for service_cls, client_factory in _SOURCES.values()
    ]
    job = await create_job(job_repo, tenant_id=tenant_id, source_type="all", scope="all", source_id=None, total_items=0)
    background_tasks.add_task(
        _run_all_sources_sync_job, tenant_id, job.job_id, bindings, job_repo, item_repo,
        only_new=bool(body.get("onlyNew", False)), dry_run=bool(body.get("dryRun", False)), limit=body.get("limit"),
    )
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


@router.get("/sync/jobs", summary="List past sync jobs across all sources (history)")
async def get_sync_jobs(
    limit: int = 20,
    scope: str | None = None,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
    item_repo: ContentAggregatorSyncJobItemRepository = Depends(get_content_aggregator_sync_job_item_repo),
) -> dict[str, Any]:
    tenant_id = user.get("tenant_id", "")
    jobs = await job_repo.list_jobs(tenant_id, None, limit=limit, scope=scope)
    serialized = []
    for j in jobs:
        stats = await item_repo.get_stats(tenant_id, j.job_id)
        serialized.append(serialize_job(j, stats))
    return {"jobs": serialized}


@router.get("/sync/jobs/active", summary="List running sync jobs (resume after reload)")
async def get_active_jobs(
    user: dict[str, Any] = Depends(_require_aggregator_access),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
    item_repo: ContentAggregatorSyncJobItemRepository = Depends(get_content_aggregator_sync_job_item_repo),
) -> dict[str, Any]:
    tenant_id = user.get("tenant_id", "")
    jobs = await job_repo.get_active_jobs(tenant_id, None)
    serialized = []
    for j in jobs:
        stats = await item_repo.get_stats(tenant_id, j.job_id)
        serialized.append(serialize_job(j, stats))
    return {"jobs": serialized}


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


async def _run_course_sync_job(
    tenant_id: str,
    job_id: str,
    service: Any,
    client: Any,
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    course_id: str,
    *,
    dry_run: bool,
) -> None:
    try:
        await service.run_single_course_sync(tenant_id, client, job_repo, item_repo, job_id, course_id, dry_run=dry_run)
        await finish_job(job_repo, item_repo, tenant_id, job_id, "completed")
    except Exception as exc:  # noqa: BLE001
        await finish_job(job_repo, item_repo, tenant_id, job_id, "failed", error=str(exc))


@router.get("/{source}/courses", summary="List synced courses for a source")
async def list_courses(
    source: str,
    limit: int = Query(20, ge=1, le=200),
    cursor: str | None = None,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    db: AsyncDatabase = Depends(get_db),
) -> dict[str, Any]:
    service, _ = _resolve(source, db)
    all_courses = await service.get_content_list(user.get("tenant_id", ""), cursor=cursor, limit=limit)
    has_more = len(all_courses) > limit
    courses = all_courses[:limit]
    next_cursor = courses[-1]["id"] if has_more and courses else None
    return {"courses": courses, "next_cursor": next_cursor, "has_more": has_more}


@router.get("/{source}/courses/{course_id}", summary="Get a synced course's full content for viewing")
async def get_course(
    source: str,
    course_id: str,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    db: AsyncDatabase = Depends(get_db),
) -> dict[str, Any]:
    service, _ = _resolve(source, db)
    doc = await service.get_course(user.get("tenant_id", ""), course_id)
    if doc is None:
        raise NotFoundError("course", course_id)
    return doc.to_dict()


@router.delete("/{source}/courses/{course_id}", summary="Delete a synced course's local copy")
async def delete_course(
    source: str,
    course_id: str,
    user: dict[str, Any] = Depends(_require_tenant),
    db: AsyncDatabase = Depends(get_db),
) -> dict[str, int]:
    service, _ = _resolve(source, db)
    deleted = await service.delete_course(user.get("tenant_id", ""), course_id)
    if not deleted:
        raise NotFoundError("course", course_id)
    return {"deleted": deleted}


@router.patch(
    "/{source}/courses/{course_id}/blocks/{block_id}",
    summary="Edit a problem block's question/choices in place (overwritten by the next sync)",
)
async def update_problem_block(
    source: str,
    course_id: str,
    block_id: str,
    body: dict[str, Any],
    user: dict[str, Any] = Depends(_require_tenant),
    db: AsyncDatabase = Depends(get_db),
) -> dict[str, int]:
    service, _ = _resolve(source, db)
    modified = await service.update_problem_block(
        user.get("tenant_id", ""), course_id, block_id, body.get("question", ""), body.get("choices", [])
    )
    if not modified:
        raise NotFoundError("block", block_id)
    return {"modified": modified}


@router.post("/{source}/sync/course/{course_id}", status_code=202, summary="Sync a single course")
async def sync_course(
    source: str,
    course_id: str,
    background_tasks: BackgroundTasks,
    body: dict[str, Any] | None = None,
    user: dict[str, Any] = Depends(_require_aggregator_access),
    db: AsyncDatabase = Depends(get_db),
    job_repo: ContentAggregatorSyncJobRepository = Depends(get_content_aggregator_sync_job_repo),
    item_repo: ContentAggregatorSyncJobItemRepository = Depends(get_content_aggregator_sync_job_item_repo),
) -> dict[str, str]:
    body = body or {}
    tenant_id = user.get("tenant_id", "")
    service, client = _resolve(source, db)
    active_jobs = await job_repo.get_active_jobs(tenant_id, source_type=source)
    if any(j.scope == "course" and j.source_id == course_id for j in active_jobs):
        raise ConflictError(f'A sync for course "{course_id}"')
    job = await create_job(job_repo, tenant_id=tenant_id, source_type=source, scope="course", source_id=course_id, total_items=1)
    background_tasks.add_task(
        _run_course_sync_job, tenant_id, job.job_id, service, client, job_repo, item_repo, course_id,
        dry_run=bool(body.get("dryRun", False))
    )
    return {"job_id": job.job_id}
