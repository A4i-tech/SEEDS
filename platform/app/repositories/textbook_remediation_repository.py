from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import ClassVar

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends
from pydantic import ValidationError
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.models.remediation_job import (
    ArtifactName,
    JobMetrics,
    JobProgress,
    JobStage,
    JobStatus,
    RemediationJob,
)
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError

logger = logging.getLogger(__name__)


def _oid(job_id: str) -> ObjectId:
    try:
        return ObjectId(job_id)
    except (InvalidId, TypeError) as exc:
        raise NotFoundError("Remediation job", job_id) from exc


class TextbookRemediationRepository:
    COLLECTION_NAME: ClassVar[str] = "textbookRemediationJobs"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def create(
        self, *, tenant_id: str, source_name: str, source_url: str, language: str,
        target_language: str | None = None,
    ) -> RemediationJob:
        initial_lang = "detecting" if language in ("auto", "detecting") else language
        doc: dict[str, object] = {
            "tenant_id": tenant_id, "source_name": source_name, "source_url": source_url,
            "language": initial_lang, "status": JobStatus.PENDING.value, "stage": None,
            "created_at": datetime.now(UTC).isoformat(), "target_language": target_language,
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return RemediationJob.from_doc(doc)

    async def set_source_url(self, job_id: str, source_url: str) -> None:
        await self._col.update_one({"_id": _oid(job_id)}, {"$set": {"source_url": source_url}})

    async def get(self, tenant_id: str, job_id: str) -> RemediationJob | None:
        doc = await self._col.find_one({"_id": _oid(job_id), "tenant_id": tenant_id, "deleted_at": None})
        return RemediationJob.from_doc(doc) if doc else None

    async def list_jobs(self, tenant_id: str, *, limit: int = 20) -> list[RemediationJob]:
        docs = await self._col.find({"tenant_id": tenant_id, "deleted_at": None}).sort("created_at", -1).to_list(length=limit)
        jobs = []
        for d in docs:
            try:
                jobs.append(RemediationJob.from_doc(d))
            except ValidationError as exc:
                logger.error("remediation: skipping malformed job doc _id=%s: %s", d.get("_id"), exc)
        return jobs

    async def soft_delete(self, tenant_id: str, job_id: str) -> RemediationJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": _oid(job_id), "tenant_id": tenant_id},
            {"$set": {"deleted_at": datetime.now(UTC).isoformat()}},
            return_document=ReturnDocument.AFTER,
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def claim_next_pending(self) -> RemediationJob | None:
        doc = await self._col.find_one_and_update(
            {"status": JobStatus.PENDING, "deleted_at": None},
            {"$set": {"status": JobStatus.RUNNING, "stage": JobStage.OCR}},
            sort=[("created_at", 1)],
            return_document=ReturnDocument.AFTER,
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def set_stage(self, job_id: str, stage: JobStage) -> RemediationJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": _oid(job_id)}, {"$set": {"stage": stage}}, return_document=ReturnDocument.AFTER
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def update_progress(self, job_id: str, progress: JobProgress) -> RemediationJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": _oid(job_id)}, {"$set": {"progress": progress.model_dump()}}, return_document=ReturnDocument.AFTER
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def update_language(self, job_id: str, language: str) -> RemediationJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": _oid(job_id)},
            {"$set": {"language": language, "detected_language": language}},
            return_document=ReturnDocument.AFTER,
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def update_metrics(self, job_id: str, metrics: JobMetrics) -> RemediationJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": _oid(job_id)}, {"$set": {"metrics": metrics.model_dump()}}, return_document=ReturnDocument.AFTER
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def update_draft(self, job_id: str, draft_md: str, draft_url: str | None = None) -> RemediationJob | None:
        update: dict[str, object] = {"draft_remediated_md": draft_md, "status": JobStatus.IN_REVIEW}
        if draft_url:
            update[f"artifacts.{ArtifactName.DRAFT}"] = draft_url
        doc = await self._col.find_one_and_update(
            {"_id": _oid(job_id)}, {"$set": update}, return_document=ReturnDocument.AFTER
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def mark_verified(
        self,
        job_id: str,
        *,
        verified_by: str,
        title: str | None = None,
    ) -> RemediationJob | None:
        update: dict[str, object] = {
            "status": JobStatus.VERIFIED,
            "verified_by": verified_by,
            "verified_at": datetime.now(UTC).isoformat(),
        }
        if title:
            update["title"] = title
        doc = await self._col.find_one_and_update(
            {"_id": _oid(job_id)}, {"$set": update}, return_document=ReturnDocument.AFTER
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def record_artifacts(
        self, job_id: str, artifacts: dict[ArtifactName, str], counts: dict[str, int]
    ) -> RemediationJob | None:
        update: dict[str, object] = {f"artifacts.{name}": url for name, url in artifacts.items()}
        update.update({f"counts.{name}": value for name, value in counts.items()})
        doc = await self._col.find_one_and_update({"_id": _oid(job_id)}, {"$set": update}, return_document=ReturnDocument.AFTER)
        return RemediationJob.from_doc(doc) if doc else None

    async def set_translation_error(self, job_id: str, message: str | None) -> RemediationJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": _oid(job_id)}, {"$set": {"translation_error": message}}, return_document=ReturnDocument.AFTER
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def finish(self, job_id: str, status: JobStatus, *, error: str | None = None) -> RemediationJob | None:
        doc = await self._col.find_one_and_update(
            {"_id": _oid(job_id)},
            {"$set": {"status": status, "error": error, "finished_at": datetime.now(UTC).isoformat()}},
            return_document=ReturnDocument.AFTER,
        )
        return RemediationJob.from_doc(doc) if doc else None

    async def reconcile_interrupted_jobs(self) -> int:
        result = await self._col.update_many(
            {"status": JobStatus.RUNNING},
            {"$set": {"status": JobStatus.FAILED, "error": "interrupted by restart", "finished_at": datetime.now(UTC).isoformat()}},
        )
        return result.modified_count


def get_textbook_remediation_repo(db: AsyncDatabase = Depends(get_db)) -> TextbookRemediationRepository:
    return TextbookRemediationRepository(db)
