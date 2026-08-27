"""Textbook remediation job repository — async PyMongo access to the
textbookRemediationJobs collection. Every read and write is tenant-scoped
except the two the consumer owns: claiming a pending job and the startup
sweep, neither of which belongs to a tenant.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

from fastapi import Depends
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.models.remediation_job import RemediationJob
from app.platform.auth.dependencies import get_db


class TextbookRemediationRepository:
    COLLECTION_NAME: ClassVar[str] = "textbookRemediationJobs"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def create(self, job_id: str, *, tenant_id: str, source_name: str, source_url: str, language: str) -> RemediationJob:
        job = RemediationJob(
            job_id=job_id, tenant_id=tenant_id, source_name=source_name, source_url=source_url,
            language=language, status="pending", stage=None, created_at=datetime.now(UTC).isoformat(),
        )
        await self._col.insert_one(job.to_doc())
        return job

    async def get(self, tenant_id: str, job_id: str) -> RemediationJob | None:
        doc = await self._col.find_one({"_id": job_id, "tenant_id": tenant_id})
        return RemediationJob.from_doc(doc) if doc else None

    async def list_jobs(self, tenant_id: str, *, limit: int = 20) -> list[RemediationJob]:
        docs = await self._col.find({"tenant_id": tenant_id}).sort("created_at", -1).to_list(length=limit)
        return [RemediationJob.from_doc(d) for d in docs]

    async def claim_next_pending(self) -> RemediationJob | None:
        """Atomically move one pending job to running. Not tenant-scoped: the consumer serves every tenant."""
        doc = await self._col.find_one_and_update(
            {"status": "pending"},
            {"$set": {"status": "running", "stage": "ocr"}},
            sort=[("created_at", 1)],
            return_document=ReturnDocument.AFTER,
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def set_stage(self, job_id: str, stage: str) -> RemediationJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": job_id}, {"$set": {"stage": stage}}, return_document=ReturnDocument.AFTER
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def record_artifacts(self, job_id: str, artifacts: dict[str, str], counts: dict[str, int]) -> RemediationJob | None:
        update = {f"artifacts.{name}": url for name, url in artifacts.items()}
        update.update({f"counts.{name}": value for name, value in counts.items()})
        doc = await self._col.find_one_and_update({"_id": job_id}, {"$set": update}, return_document=ReturnDocument.AFTER)
        return RemediationJob.from_doc(doc) if doc else None

    async def finish(self, job_id: str, status: str, *, error: str | None = None) -> RemediationJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": job_id},
            {"$set": {"status": status, "error": error, "finished_at": datetime.now(UTC).isoformat()}},
            return_document=ReturnDocument.AFTER,
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def reconcile_interrupted_jobs(self) -> int:
        """Startup-only sweep. A running job has no consumer left after a restart."""
        result = await self._col.update_many(
            {"status": "running"},
            {"$set": {"status": "failed", "error": "interrupted by restart", "finished_at": datetime.now(UTC).isoformat()}},
        )
        return result.modified_count


def get_textbook_remediation_repo(db: AsyncDatabase = Depends(get_db)) -> TextbookRemediationRepository:
    return TextbookRemediationRepository(db)
