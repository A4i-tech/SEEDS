from __future__ import annotations

from app.aggregators.sync_job_models import SyncJob


def test_sync_job_retry_count_defaults_to_zero_and_round_trips():
    job = SyncJob(
        job_id="job-1", tenant_id="tenant-1", source_type="subodha", scope="all",
        source_id=None, status="pending", created_at="2026-09-09T00:00:00+00:00",
        started_at=None, finished_at=None, total_items=0, error=None, options={},
    )
    assert job.retry_count == 0
    assert job.to_doc()["retry_count"] == 0

    restored = SyncJob.from_doc({**job.to_doc()})
    assert restored.retry_count == 0


def test_sync_job_from_doc_defaults_retry_count_for_legacy_docs():
    doc = {
        "_id": "job-2", "tenant_id": "tenant-1", "source_type": "subodha", "scope": "all",
        "source_id": None, "status": "running", "created_at": "2026-09-09T00:00:00+00:00",
        "started_at": "2026-09-09T00:00:00+00:00", "finished_at": None,
        "total_items": 0, "error": None, "options": {},
        # no "retry_count" key — simulates a doc written before this change
    }
    job = SyncJob.from_doc(doc)
    assert job.retry_count == 0
