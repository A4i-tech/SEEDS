"""Content aggregator sync job repository — PyMongo async data access for the
contentAggregatorSyncJobs collection. Every read/write is tenant-scoped, except
two intentionally-global operations: reconcile_interrupted_jobs (startup sweep)
and claim_next_pending (cross-tenant work queue).
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

from fastapi import Depends
from pymongo import ASCENDING, ReturnDocument, UpdateOne
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.sync_job_models import SyncJob
from app.platform.auth.dependencies import get_db


class ContentAggregatorSyncJobRepository:
    COLLECTION_NAME: ClassVar[str] = "contentAggregatorSyncJobs"
    MAX_INTERRUPTED_RETRIES: ClassVar[int] = 3

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def create_job(
        self,
        job_id: str,
        *,
        tenant_id: str,
        source_type: str,
        scope: str,
        source_id: str | None,
        total_items: int,
        options: dict[str, object] = {},  # noqa: B006
    ) -> SyncJob:
        job = SyncJob(
            job_id=job_id, tenant_id=tenant_id, source_type=source_type, scope=scope, source_id=source_id,
            status="pending", created_at=datetime.now(UTC).isoformat(), started_at=None, finished_at=None,
            total_items=total_items, error=None, options=options,
        )
        await self._col.insert_one(job.to_doc())
        return job

    async def claim_next_pending(self, source_type: str) -> SyncJob | None:
        """Atomically claims the oldest pending job for source_type. Not tenant-scoped —
        this is a global work queue, same exception class as reconcile_interrupted_jobs."""
        doc = await self._col.find_one_and_update(
            {"status": "pending", "source_type": source_type},
            {"$set": {"status": "running", "started_at": datetime.now(UTC).isoformat()}},
            sort=[("created_at", ASCENDING)],
            return_document=ReturnDocument.AFTER,
        )
        return SyncJob.from_doc(doc) if doc else None

    async def set_total_items(self, tenant_id: str, job_id: str, total: int) -> SyncJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": job_id, "tenant_id": tenant_id}, {"$set": {"total_items": total}}, return_document=ReturnDocument.AFTER
        )
        return SyncJob.from_doc(doc) if doc else None

    async def set_job_status(self, tenant_id: str, job_id: str, status: str, *, error: str | None = None) -> SyncJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": job_id, "tenant_id": tenant_id},
            {"$set": {"status": status, "finished_at": datetime.now(UTC).isoformat(), "error": error}},
            return_document=ReturnDocument.AFTER,
        )
        return SyncJob.from_doc(doc) if doc else None

    async def get_job(self, tenant_id: str, job_id: str) -> SyncJob | None:
        doc = await self._col.find_one({"_id": job_id, "tenant_id": tenant_id})
        return SyncJob.from_doc(doc) if doc else None

    async def list_jobs(
        self, tenant_id: str, source_type: str | None = None, *, limit: int = 20, scope: str | None = None, source_id: str | None = None
    ) -> list[SyncJob]:
        query: dict[str, object] = {"tenant_id": tenant_id}
        if source_type:
            query["source_type"] = source_type
        if scope:
            query["scope"] = scope
        if source_id:
            query["source_id"] = source_id
        docs = await self._col.find(query).sort("created_at", -1).to_list(length=limit)
        return [SyncJob.from_doc(d) for d in docs]

    async def get_active_jobs(self, tenant_id: str, source_type: str | None = None) -> list[SyncJob]:
        query: dict[str, object] = {"tenant_id": tenant_id, "status": {"$in": ["pending", "running"]}}
        if source_type:
            query["source_type"] = source_type
        docs = await self._col.find(query).to_list(length=None)
        return [SyncJob.from_doc(d) for d in docs]

    async def reconcile_interrupted_jobs(self) -> int:
        """Startup-only maintenance sweep — intentionally not tenant-scoped. Only call this
        from a process that hosts SyncJobConsumer (APP_MODE in ("consumer", "all")).

        Jobs left in "running" state (the consumer died mid-processing) are re-queued back
        to "pending" so claim_next_pending can retry them, up to MAX_INTERRUPTED_RETRIES.
        Jobs that have already been interrupted that many times are marked "failed" instead.
        "pending" jobs are left untouched — they were never claimed and remain safely resumable.
        """
        interrupted = await self._col.find({"status": "running"}).to_list(length=None)
        if not interrupted:
            return 0

        now = datetime.now(UTC).isoformat()
        ops: list[UpdateOne] = []
        for doc in interrupted:
            new_retry_count = doc.get("retry_count", 0) + 1
            if new_retry_count <= self.MAX_INTERRUPTED_RETRIES:
                update = {
                    "$set": {
                        "status": "pending",
                        "retry_count": new_retry_count,
                        "started_at": None,
                        "error": None,
                    }
                }
            else:
                update = {
                    "$set": {
                        "status": "failed",
                        "retry_count": new_retry_count,
                        "error": "exceeded max retries after interruption",
                        "finished_at": now,
                    }
                }
            ops.append(UpdateOne({"_id": doc["_id"]}, update))

        result = await self._col.bulk_write(ops)
        return result.modified_count


def get_content_aggregator_sync_job_repo(db: AsyncDatabase = Depends(get_db)) -> ContentAggregatorSyncJobRepository:
    return ContentAggregatorSyncJobRepository(db)
