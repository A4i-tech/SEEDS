from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.consumers.sync_job_consumer import SyncJobConsumer


@pytest.mark.asyncio
async def test_run_loop_claims_and_stops_when_no_job_available():
    job_repo = MagicMock()
    job_repo.claim_next_pending = AsyncMock(return_value=None)
    consumer = SyncJobConsumer(job_repo=job_repo, item_repo=MagicMock(), db=MagicMock(), poll_interval_seconds=0)
    consumer._running = True

    async def _stop(*_):
        consumer._running = False

    consumer._sleep = AsyncMock(side_effect=_stop)
    await consumer._run_loop()
    job_repo.claim_next_pending.assert_awaited_with("subodha")


@pytest.mark.asyncio
async def test_run_loop_marks_job_failed_when_client_construction_raises(monkeypatch):
    from app.aggregators.sync_job_models import SyncJob

    claimed_job = SyncJob(
        job_id="job-x", tenant_id="t1", source_type="subodha", scope="all", source_id=None,
        status="running", created_at="now", started_at="now", finished_at=None, total_items=0, error=None, options={},
    )
    job_repo = MagicMock()
    job_repo.claim_next_pending = AsyncMock(side_effect=[claimed_job, None])
    item_repo = MagicMock()

    finish_job_mock = AsyncMock()
    monkeypatch.setattr("app.consumers.sync_job_consumer.finish_job", finish_job_mock)

    def _boom():
        raise RuntimeError("tenant Subodha creds missing")

    monkeypatch.setattr("app.consumers.sync_job_consumer.get_subodha_client", _boom)

    consumer = SyncJobConsumer(job_repo=job_repo, item_repo=item_repo, db=MagicMock(), poll_interval_seconds=0)
    consumer._running = True
    tick_count = 0

    async def _one_tick(*_):
        nonlocal tick_count
        tick_count += 1
        if tick_count >= 1:
            consumer._running = False

    consumer._sleep = AsyncMock(side_effect=_one_tick)
    await consumer._run_loop()

    finish_job_mock.assert_awaited_once_with(job_repo, "t1", "job-x", "failed", error="tenant Subodha creds missing")


@pytest.mark.asyncio
async def test_run_loop_dispatches_scope_all_job_with_options(monkeypatch):
    from app.aggregators.sync_job_models import SyncJob

    claimed_job = SyncJob(
        job_id="job-y", tenant_id="t1", source_type="subodha", scope="all", source_id=None,
        status="running", created_at="now", started_at="now", finished_at=None, total_items=0, error=None,
        options={"only_new": True, "dry_run": True, "limit": 5},
    )
    job_repo = MagicMock()
    job_repo.claim_next_pending = AsyncMock(side_effect=[claimed_job, None])
    item_repo = MagicMock()

    monkeypatch.setattr("app.consumers.sync_job_consumer.get_subodha_client", lambda: MagicMock())
    monkeypatch.setattr("app.consumers.sync_job_consumer.get_subodha_service", lambda db: MagicMock())

    run_sync_job_mock = AsyncMock()
    monkeypatch.setattr("app.consumers.sync_job_consumer._run_sync_job", run_sync_job_mock)

    consumer = SyncJobConsumer(job_repo=job_repo, item_repo=item_repo, db=MagicMock(), poll_interval_seconds=0)
    consumer._running = True
    consumer._sleep = AsyncMock(side_effect=lambda *_: setattr(consumer, "_running", False))
    await consumer._run_loop()

    _, kwargs = run_sync_job_mock.call_args
    assert kwargs == {"only_new": True, "dry_run": True, "limit": 5}


@pytest.mark.asyncio
async def test_run_loop_dispatches_scope_course_job(monkeypatch):
    from app.aggregators.sync_job_models import SyncJob

    claimed_job = SyncJob(
        job_id="job-z", tenant_id="t1", source_type="subodha", scope="course", source_id="course-1",
        status="running", created_at="now", started_at="now", finished_at=None, total_items=1, error=None,
        options={"dry_run": True},
    )
    job_repo = MagicMock()
    job_repo.claim_next_pending = AsyncMock(side_effect=[claimed_job, None])
    item_repo = MagicMock()

    monkeypatch.setattr("app.consumers.sync_job_consumer.get_subodha_client", lambda: MagicMock())
    monkeypatch.setattr("app.consumers.sync_job_consumer.get_subodha_service", lambda db: MagicMock())

    run_course_sync_job_mock = AsyncMock()
    monkeypatch.setattr("app.consumers.sync_job_consumer._run_course_sync_job", run_course_sync_job_mock)

    consumer = SyncJobConsumer(job_repo=job_repo, item_repo=item_repo, db=MagicMock(), poll_interval_seconds=0)
    consumer._running = True
    consumer._sleep = AsyncMock(side_effect=lambda *_: setattr(consumer, "_running", False))
    await consumer._run_loop()

    args, kwargs = run_course_sync_job_mock.call_args
    assert args[-1] == "course-1"
    assert kwargs == {"dry_run": True}


@pytest.mark.asyncio
async def test_wait_for_next_poll_falls_back_to_sleep_when_queue_unconfigured(monkeypatch):
    from app.consumers import sync_job_consumer as mod

    monkeypatch.setattr(mod.service_bus_provider, "get_sync_jobs_queue", lambda: None)
    consumer = SyncJobConsumer(job_repo=MagicMock(), item_repo=MagicMock(), db=MagicMock(), poll_interval_seconds=7)
    consumer._sleep = AsyncMock()

    await consumer._wait_for_next_poll()

    consumer._sleep.assert_awaited_once_with(7)


@pytest.mark.asyncio
async def test_wait_for_next_poll_receives_from_sync_jobs_queue_when_configured(monkeypatch):
    from app.consumers import sync_job_consumer as mod

    monkeypatch.setattr(mod.service_bus_provider, "get_sync_jobs_queue", lambda: MagicMock())
    receive_mock = AsyncMock(return_value=[])
    monkeypatch.setattr(mod.service_bus_provider, "receive_messages", receive_mock)
    consumer = SyncJobConsumer(job_repo=MagicMock(), item_repo=MagicMock(), db=MagicMock(), poll_interval_seconds=7)
    consumer._sleep = AsyncMock()

    await consumer._wait_for_next_poll()

    receive_mock.assert_awaited_once_with("sync_jobs", max_count=1, wait_seconds=7)
    consumer._sleep.assert_not_awaited()


@pytest.mark.asyncio
async def test_wait_for_next_poll_falls_back_to_sleep_on_receive_error(monkeypatch):
    from app.consumers import sync_job_consumer as mod

    monkeypatch.setattr(mod.service_bus_provider, "get_sync_jobs_queue", lambda: MagicMock())
    monkeypatch.setattr(
        mod.service_bus_provider, "receive_messages", AsyncMock(side_effect=RuntimeError("boom"))
    )
    consumer = SyncJobConsumer(job_repo=MagicMock(), item_repo=MagicMock(), db=MagicMock(), poll_interval_seconds=3)
    consumer._sleep = AsyncMock()

    await consumer._wait_for_next_poll()

    consumer._sleep.assert_awaited_once_with(3)
