"""Subodha sync job orchestration: id generation, persistence writes, and
in-process pub/sub so SSE subscribers see live progress.

Every function takes a tenant_id and forwards it to the (tenant-scoped)
repository — a job id alone (even if guessed/leaked) never grants access to
another tenant's job, since the repo lookup itself is tenant-filtered.
"""
from __future__ import annotations

import asyncio
import uuid
from collections.abc import AsyncIterator
from typing import Any

from app.repositories.subodha_job_repository import SubodhaJobRepository

_subscribers: dict[str, list[asyncio.Queue]] = {}


def serialize_job(doc: dict[str, Any]) -> dict[str, Any]:
    doc = dict(doc)
    doc["jobId"] = doc.pop("_id")
    return doc


def _broadcast(job_id: str, event: dict[str, Any]) -> None:
    for queue in _subscribers.get(job_id, []):
        queue.put_nowait(event)


async def create_job(
    repo: SubodhaJobRepository, *, tenant_id: str, scope: str, course_id: str | None, total_courses: int
) -> dict[str, Any]:
    job_id = str(uuid.uuid4())
    return await repo.create_job(job_id, tenant_id=tenant_id, scope=scope, course_id=course_id, total_courses=total_courses)


async def set_total(repo: SubodhaJobRepository, tenant_id: str, job_id: str, total: int) -> None:
    doc = await repo.set_total_courses(tenant_id, job_id, total)
    if doc is not None:
        _broadcast(job_id, {"event": "progress", "job": serialize_job(doc)})


async def record_course_result(repo: SubodhaJobRepository, tenant_id: str, job_id: str, entry: dict[str, Any]) -> None:
    doc = await repo.append_course_result(tenant_id, job_id, entry)
    if doc is not None:
        _broadcast(job_id, {"event": "progress", "job": serialize_job(doc)})


async def finish_job(
    repo: SubodhaJobRepository, tenant_id: str, job_id: str, status: str, *, error: str | None = None
) -> None:
    doc = await repo.set_job_status(tenant_id, job_id, status, error=error)
    if doc is not None:
        _broadcast(job_id, {"event": "done", "job": serialize_job(doc)})
    _subscribers.pop(job_id, None)


async def subscribe(repo: SubodhaJobRepository, tenant_id: str, job_id: str) -> AsyncIterator[dict[str, Any]]:
    """Yield the job's current state first, then live updates until it finishes.

    Yields nothing if the job doesn't exist OR belongs to a different tenant
    — a wrong-tenant lookup and a missing job are indistinguishable to the caller.
    """
    current = await repo.get_job(tenant_id, job_id)
    if current is None:
        return
    if current["status"] != "running":
        yield {"event": "done", "job": serialize_job(current)}
        return
    yield {"event": "progress", "job": serialize_job(current)}

    queue: asyncio.Queue = asyncio.Queue()
    subs = _subscribers.setdefault(job_id, [])
    subs.append(queue)
    try:
        # Re-check: the job may have finished between the read above and
        # registering as a subscriber (closes the race, doesn't need to be airtight).
        current = await repo.get_job(tenant_id, job_id)
        if current is not None and current["status"] != "running":
            yield {"event": "done", "job": serialize_job(current)}
            return
        while True:
            event = await queue.get()
            yield event
            if event["event"] == "done":
                break
    finally:
        if queue in subs:
            subs.remove(queue)
