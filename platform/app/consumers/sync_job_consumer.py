"""SyncJobConsumer — polls contentAggregatorSyncJobs for pending Subodha sync jobs,
claims and executes them.
"""
from __future__ import annotations

import asyncio
import logging

from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.sync_job_models import SyncJob
from app.consumers.base_consumer import BaseConsumer
from app.providers.service_bus import service_bus_provider
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.services.content_aggregator_sync_jobs import finish_job
from app.services.subodha_service import SubodhaService

logger = logging.getLogger(__name__)

SOURCE_TYPE = "subodha"


async def _run_sync_job(
    tenant_id: str,
    job_id: str,
    service: SubodhaService,
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    *,
    only_new: bool,
    dry_run: bool,
    limit: int | None,
) -> None:
    try:
        course_ids = None
        if only_new:
            diff = await service.get_course_diff(tenant_id)
            course_ids = diff["newCourseIds"]
            all_courses = diff["liveCourses"]
        else:
            all_courses = await service.list_live_courses()

        await service.run_sync(
            tenant_id, job_repo, item_repo, job_id, all_courses, course_ids=course_ids,
            limit=limit if limit is not None else (len(course_ids) if course_ids is not None else None),
            dry_run=dry_run,
        )
        await finish_job(job_repo, item_repo, tenant_id, job_id, "completed")
    except Exception as exc:  # noqa: BLE001
        await finish_job(job_repo, item_repo, tenant_id, job_id, "failed", error=str(exc))


async def _run_course_sync_job(
    tenant_id: str,
    job_id: str,
    service: SubodhaService,
    job_repo: ContentAggregatorSyncJobRepository,
    item_repo: ContentAggregatorSyncJobItemRepository,
    course_id: str,
    *,
    dry_run: bool,
) -> None:
    try:
        await service.run_single_course_sync(tenant_id, job_repo, item_repo, job_id, course_id, dry_run=dry_run)
        await finish_job(job_repo, item_repo, tenant_id, job_id, "completed")
    except Exception as exc:  # noqa: BLE001
        await finish_job(job_repo, item_repo, tenant_id, job_id, "failed", error=str(exc))


class SyncJobConsumer(BaseConsumer):
    name = "sync_job_consumer"

    def __init__(
        self,
        job_repo: ContentAggregatorSyncJobRepository,
        item_repo: ContentAggregatorSyncJobItemRepository,
        db: AsyncDatabase,
        poll_interval_seconds: float = 10.0,
        service: SubodhaService | None = None,
    ) -> None:
        self._job_repo = job_repo
        self._item_repo = item_repo
        self._db = db
        self._service = service if service is not None else SubodhaService(db)
        self._poll_interval_seconds = poll_interval_seconds

    async def _sleep(self, seconds: float) -> None:
        await asyncio.sleep(seconds)

    async def _wait_for_next_poll(self) -> None:
        """Wait for the next poll tick — either woken early by a Service Bus
        sync_jobs message, or (if the queue isn't configured) a plain sleep.

        Messages received here are just a wake signal; claim_next_pending()
        still does the real work on the next loop iteration, so the message
        content is ignored.
        """
        if service_bus_provider.get_sync_jobs_queue() is None:
            await self._sleep(self._poll_interval_seconds)
            return
        try:
            messages = await service_bus_provider.receive_messages(
                "sync_jobs", max_count=1, wait_seconds=self._poll_interval_seconds
            )
            for msg in messages:
                await service_bus_provider.complete_message("sync_jobs", msg)
        except Exception as exc:  # noqa: BLE001
            logger.warning("sync_job_consumer: wake-up receive failed (%s) — falling back to sleep", exc)
            await self._sleep(self._poll_interval_seconds)

    async def _run_loop(self) -> None:
        while True:
            job: SyncJob | None = await self._job_repo.claim_next_pending(SOURCE_TYPE)
            if job is None:
                await self._wait_for_next_poll()
                continue
            await self.process(job)

    async def process(self, message: SyncJob) -> None:
        job = message
        try:
            if job.scope == "all":
                await _run_sync_job(
                    job.tenant_id, job.job_id, self._service, self._job_repo, self._item_repo,
                    only_new=bool(job.options.get("only_new", False)),
                    dry_run=bool(job.options.get("dry_run", False)),
                    limit=job.options.get("limit"),
                )
            else:
                await _run_course_sync_job(
                    job.tenant_id, job.job_id, self._service, self._job_repo, self._item_repo,
                    job.source_id, dry_run=bool(job.options.get("dry_run", False)),
                )
        except Exception as exc:  # noqa: BLE001
            logger.error("sync_job_consumer: job %s failed before/during dispatch: %s", job.job_id, exc)
            await finish_job(self._job_repo, self._item_repo, job.tenant_id, job.job_id, "failed", error=str(exc))
