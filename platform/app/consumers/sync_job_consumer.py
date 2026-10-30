from __future__ import annotations

import asyncio
import logging

from app.aggregators.sync_job_models import SyncJob, SyncJobStatus, SyncScope
from app.consumers.base_consumer import BaseConsumer
from app.providers.service_bus import service_bus_provider
from app.services.content_aggregator_source_service import ContentAggregatorSourceService

logger = logging.getLogger(__name__)


class SyncJobConsumer(BaseConsumer):
    name = "sync_job_consumer"

    def __init__(self, service: ContentAggregatorSourceService, poll_interval_seconds: float = 10.0) -> None:
        self._service = service
        self.name = f"sync_job_consumer_{service.SOURCE_TYPE.value}"
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
            job = await self._service.claim_next_pending_job()
            if job is None:
                await self._wait_for_next_poll()
                continue
            await self.process(job)

    async def process(self, message: SyncJob) -> None:
        job = message
        try:
            if job.scope == SyncScope.ALL:
                await self._service.run_sync(
                    job.tenant_id, job.job_id,
                    only_new=job.options.only_new, limit=job.options.limit, dry_run=job.options.dry_run,
                )
            else:
                await self._service.run_single_course_sync(
                    job.tenant_id, job.job_id, job.source_id, dry_run=job.options.dry_run,
                )
            await self._service.finish_job(job.tenant_id, job.job_id, SyncJobStatus.COMPLETED)
        except Exception as exc:  # noqa: BLE001
            logger.exception("sync_job_consumer: job %s failed before/during dispatch", job.job_id)
            await self._service.finish_job(job.tenant_id, job.job_id, SyncJobStatus.FAILED, error=str(exc))
