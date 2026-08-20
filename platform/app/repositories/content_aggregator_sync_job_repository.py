"""Content aggregator sync job repository — PyMongo async data access for the
contentAggregatorSyncJobs collection. Every read/write is tenant-scoped
(except the startup-only reconcile_interrupted_jobs sweep), further scoped to
source_type where a job belongs to one specific aggregator.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

from fastapi import Depends
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.sync_job_models import SyncJob
from app.platform.auth.dependencies import get_db


class ContentAggregatorSyncJobRepository:
    COLLECTION_NAME: ClassVar[str] = "contentAggregatorSyncJobs"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def create_job(
        self, job_id: str, *, tenant_id: str, source_type: str, scope: str, source_id: str | None, total_items: int
    ) -> SyncJob:
        job = SyncJob(
            job_id=job_id, tenant_id=tenant_id, source_type=source_type, scope=scope, source_id=source_id,
            status="running", started_at=datetime.now(UTC).isoformat(), finished_at=None,
            total_items=total_items, error=None,
        )
        await self._col.insert_one(job.to_doc())
        return job

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
        docs = await self._col.find(query).sort("started_at", -1).to_list(length=limit)
        return [SyncJob.from_doc(d) for d in docs]

    async def get_active_jobs(self, tenant_id: str, source_type: str | None = None) -> list[SyncJob]:
        query: dict[str, object] = {"tenant_id": tenant_id, "status": "running"}
        if source_type:
            query["source_type"] = source_type
        docs = await self._col.find(query).to_list(length=None)
        return [SyncJob.from_doc(d) for d in docs]

    async def reconcile_interrupted_jobs(self) -> int:
        """Startup-only maintenance sweep — intentionally not tenant-scoped."""
        result = await self._col.update_many(
            {"status": "running"},
            {"$set": {"status": "failed", "error": "interrupted by restart", "finished_at": datetime.now(UTC).isoformat()}},
        )
        return result.modified_count


def get_content_aggregator_sync_job_repo(db: AsyncDatabase = Depends(get_db)) -> ContentAggregatorSyncJobRepository:
    return ContentAggregatorSyncJobRepository(db)
