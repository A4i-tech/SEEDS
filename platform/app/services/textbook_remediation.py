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
_TERMINAL = ("ready_to_review", "completed", "verified", "failed")

_subscribers: dict[str, list[asyncio.Queue[dict[str, object]]]] = {}


def broadcast_event(job_id: str, event: dict[str, object]) -> None:
    for q in list(_subscribers.get(job_id, [])):
        q.put_nowait(event)


def broadcast_job(job: RemediationJob, *, event_type: str = "progress") -> None:
    payload = serialize_job(job)
    evt = {"event": "done" if job.status in _TERMINAL else event_type, "job": payload}
    broadcast_event(job.job_id, evt)


def serialize_job(job: RemediationJob) -> dict[str, object]:
    return {
        "job_id": job.job_id,
        "source_name": job.source_name,
        "language": job.language,
        "detected_language": job.detected_language,
        "status": job.status,
        "stage": job.stage,
        "stage_index": STAGES.index(job.stage) + 1 if job.stage in STAGES else 0,
        "stage_count": len(STAGES),
        "artifacts": job.artifacts,
        "counts": job.counts,
        "metrics": job.metrics,
        "progress": job.progress,
        "draft_remediated_md": job.draft_remediated_md,
        "verified_at": job.verified_at,
        "verified_by": job.verified_by,
        "title": job.title,
        "error": job.error,
        "created_at": job.created_at,
        "finished_at": job.finished_at,
    }


async def subscribe(
    repo: TextbookRemediationRepository, tenant_id: str, job_id: str, *, interval: float = POLL_INTERVAL_SECONDS
) -> AsyncIterator[dict[str, object]]:
    """Streams live remediation job progress via SSE push queue with database polling fallback."""
    queue: asyncio.Queue[dict[str, object]] = asyncio.Queue()
    subs = _subscribers.setdefault(job_id, [])
    subs.append(queue)

    previous: dict[str, object] | None = None
    try:
        while True:
            while not queue.empty():
                event = queue.get_nowait()
                yield event
                if event.get("event") == "done":
                    return

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

            if interval > 0:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=interval)
                    yield event
                    if event.get("event") == "done":
                        return
                    if "job" in event and isinstance(event["job"], dict):
                        previous = event["job"]
                except TimeoutError:
                    pass
            else:
                await asyncio.sleep(0)
    finally:
        if queue in subs:
            subs.remove(queue)
        if not subs:
            _subscribers.pop(job_id, None)
