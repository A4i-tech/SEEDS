from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.aggregators.models import SourceType
from app.aggregators.sync_job_models import SyncJob, SyncJobStatus, SyncOptions, SyncScope
from app.consumers import sync_job_consumer as mod
from app.consumers.sync_job_consumer import SyncJobConsumer


def _service() -> MagicMock:
    service = MagicMock()
    service.SOURCE_TYPE = SourceType.SUBODHA
    return service


@pytest.mark.asyncio
async def test_run_loop_claims_and_stops_when_no_job_available():
    service = _service()
    service.claim_next_pending_job = AsyncMock(return_value=None)
    consumer = SyncJobConsumer(service, poll_interval_seconds=0)

    consumer._sleep = AsyncMock(side_effect=asyncio.CancelledError)
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()
    service.claim_next_pending_job.assert_awaited()


@pytest.mark.asyncio
async def test_run_loop_dispatches_scope_all_job_with_options():
    claimed_job = SyncJob(
        job_id="job-y", tenant_id="t1", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="",
        status=SyncJobStatus.RUNNING, created_at="now", started_at="now", finished_at="", total_items=0, error="",
        options=SyncOptions(only_new=True, dry_run=True, limit=5),
    )
    service = _service()
    service.claim_next_pending_job = AsyncMock(side_effect=[claimed_job, None])
    service.run_sync = AsyncMock()
    service.finish_job = AsyncMock()

    consumer = SyncJobConsumer(service, poll_interval_seconds=0)
    consumer._sleep = AsyncMock(side_effect=asyncio.CancelledError)
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    service.run_sync.assert_awaited_once_with("t1", "job-y", only_new=True, limit=5, dry_run=True)
    service.finish_job.assert_awaited_once_with("t1", "job-y", SyncJobStatus.COMPLETED)


@pytest.mark.asyncio
async def test_run_loop_dispatches_scope_course_job():
    claimed_job = SyncJob(
        job_id="job-z", tenant_id="t1", source_type=SourceType.SUBODHA, scope=SyncScope.COURSE, source_id="course-1",
        status=SyncJobStatus.RUNNING, created_at="now", started_at="now", finished_at="", total_items=1, error="",
        options=SyncOptions(dry_run=True),
    )
    service = _service()
    service.claim_next_pending_job = AsyncMock(side_effect=[claimed_job, None])
    service.run_single_course_sync = AsyncMock()
    service.finish_job = AsyncMock()

    consumer = SyncJobConsumer(service, poll_interval_seconds=0)
    consumer._sleep = AsyncMock(side_effect=asyncio.CancelledError)
    with pytest.raises(asyncio.CancelledError):
        await consumer._run_loop()

    service.run_single_course_sync.assert_awaited_once_with("t1", "job-z", "course-1", dry_run=True)
    service.finish_job.assert_awaited_once_with("t1", "job-z", SyncJobStatus.COMPLETED)


@pytest.mark.asyncio
async def test_process_marks_job_failed_when_sync_raises():
    service = _service()
    service.run_sync = AsyncMock(side_effect=RuntimeError("boom"))
    service.finish_job = AsyncMock()
    job = SyncJob(
        job_id="job-1", tenant_id="t1", source_type=SourceType.SUBODHA, scope=SyncScope.ALL, source_id="",
        status=SyncJobStatus.RUNNING, created_at="now", started_at="now", finished_at="", total_items=0, error="",
        options=SyncOptions(),
    )

    await SyncJobConsumer(service).process(job)

    service.finish_job.assert_awaited_once_with("t1", "job-1", SyncJobStatus.FAILED, error="boom")


@pytest.mark.asyncio
async def test_wait_for_next_poll_falls_back_to_sleep_when_queue_unconfigured(monkeypatch):
    monkeypatch.setattr(mod.service_bus_provider, "get_sync_jobs_queue", lambda: None)
    consumer = SyncJobConsumer(_service(), poll_interval_seconds=7)
    consumer._sleep = AsyncMock()

    await consumer._wait_for_next_poll()

    consumer._sleep.assert_awaited_once_with(7)


@pytest.mark.asyncio
async def test_wait_for_next_poll_receives_from_sync_jobs_queue_when_configured(monkeypatch):
    monkeypatch.setattr(mod.service_bus_provider, "get_sync_jobs_queue", lambda: MagicMock())
    receive_mock = AsyncMock(return_value=[])
    monkeypatch.setattr(mod.service_bus_provider, "receive_messages", receive_mock)
    consumer = SyncJobConsumer(_service(), poll_interval_seconds=7)
    consumer._sleep = AsyncMock()

    await consumer._wait_for_next_poll()

    receive_mock.assert_awaited_once_with("sync_jobs", max_count=1, wait_seconds=7)
    consumer._sleep.assert_not_awaited()


@pytest.mark.asyncio
async def test_wait_for_next_poll_falls_back_to_sleep_on_receive_error(monkeypatch):
    monkeypatch.setattr(mod.service_bus_provider, "get_sync_jobs_queue", lambda: MagicMock())
    monkeypatch.setattr(
        mod.service_bus_provider, "receive_messages", AsyncMock(side_effect=RuntimeError("boom"))
    )
    consumer = SyncJobConsumer(_service(), poll_interval_seconds=3)
    consumer._sleep = AsyncMock()

    await consumer._wait_for_next_poll()

    consumer._sleep.assert_awaited_once_with(3)
