"""Textbook remediation job serialization for the /textbook-remediation/* API,
and the SSE progress stream behind it.

The stream polls Mongo rather than using the in-process pub/sub the content
aggregator uses. The remediation pipelines run in the consumer process and the
stream is served from the API process, so an in-process queue would never
deliver — the database is the only thing both sides share.
"""
from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator

from app.models.remediation_job import STAGES, RemediationJob
from app.repositories.textbook_remediation_repository import TextbookRemediationRepository

POLL_INTERVAL_SECONDS = 1.0
_TERMINAL = ("completed", "failed")


def serialize_job(job: RemediationJob) -> dict[str, object]:
    return {
        "job_id": job.job_id,
        "source_name": job.source_name,
        "language": job.language,
        "status": job.status,
        "stage": job.stage,
        "stage_index": STAGES.index(job.stage) + 1 if job.stage in STAGES else 0,
        "stage_count": len(STAGES),
        "artifacts": job.artifacts,
        "counts": job.counts,
        "error": job.error,
        "created_at": job.created_at,
        "finished_at": job.finished_at,
    }


async def subscribe(
    repo: TextbookRemediationRepository, tenant_id: str, job_id: str, *, interval: float = POLL_INTERVAL_SECONDS
) -> AsyncIterator[dict[str, object]]:
    """Yields the job whenever it changes, then once more when it finishes."""
    previous: dict[str, object] | None = None
    while True:
        job = await repo.get(tenant_id, job_id)
        if job is None:
            return
        payload = serialize_job(job)
        if job.status in _TERMINAL:
            yield {"event": "done", "job": payload}
            return
        if payload != previous:
            yield {"event": "progress", "job": payload}
            previous = payload
        await asyncio.sleep(interval)
