"""Subodha sync job repository — PyMongo async data access for the subodhaSyncJobs collection.

Persists sync job state so progress survives backend restarts and a user
logging out/in mid-sync, and so past runs can be reviewed later.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from fastapi import Depends
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.platform.auth.dependencies import get_db
from app.platform.settings import get_settings


class SubodhaJobRepository:
    """Every read/write is scoped to `tenantId` (except the startup-only
    `reconcile_interrupted_jobs` sweep) — job ids are globally unique uuids,
    but that alone must not let one tenant read or mutate another's job."""

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[get_settings().subodha_jobs_collection_name]

    async def create_job(
        self, job_id: str, *, tenant_id: str, scope: str, course_id: str | None, total_courses: int
    ) -> dict[str, Any]:
        doc = {
            "_id": job_id,
            "tenantId": tenant_id,
            "scope": scope,
            "courseId": course_id,
            "status": "running",
            "startedAt": datetime.now(UTC).isoformat(),
            "finishedAt": None,
            "totalCourses": total_courses,
            "processed": 0,
            "stats": {"saved": 0, "skipped": 0, "empty": 0, "failed": 0},
            "courses": [],
            "error": None,
        }
        await self._col.insert_one(doc)
        return doc

    async def set_total_courses(self, tenant_id: str, job_id: str, total: int) -> dict[str, Any] | None:
        return await self._col.find_one_and_update(
            {"_id": job_id, "tenantId": tenant_id},
            {"$set": {"totalCourses": total}},
            return_document=ReturnDocument.AFTER,
        )

    async def append_course_result(self, tenant_id: str, job_id: str, entry: dict[str, Any]) -> dict[str, Any] | None:
        return await self._col.find_one_and_update(
            {"_id": job_id, "tenantId": tenant_id},
            {"$push": {"courses": entry}, "$inc": {"processed": 1, f"stats.{entry['status']}": 1}},
            return_document=ReturnDocument.AFTER,
        )

    async def set_job_status(
        self, tenant_id: str, job_id: str, status: str, *, error: str | None = None
    ) -> dict[str, Any] | None:
        return await self._col.find_one_and_update(
            {"_id": job_id, "tenantId": tenant_id},
            {"$set": {"status": status, "finishedAt": datetime.now(UTC).isoformat(), "error": error}},
            return_document=ReturnDocument.AFTER,
        )

    async def get_job(self, tenant_id: str, job_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": job_id, "tenantId": tenant_id})

    async def list_jobs(
        self, tenant_id: str, *, limit: int = 20, scope: str | None = None, course_id: str | None = None
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {"tenantId": tenant_id}
        if scope:
            query["scope"] = scope
        if course_id:
            query["courseId"] = course_id
        return await self._col.find(query).sort("startedAt", -1).to_list(length=limit)

    async def get_active_jobs(self, tenant_id: str) -> list[dict[str, Any]]:
        return await self._col.find({"tenantId": tenant_id, "status": "running"}).to_list(length=None)

    async def reconcile_interrupted_jobs(self) -> int:
        """Startup-only maintenance sweep — intentionally not tenant-scoped."""
        result = await self._col.update_many(
            {"status": "running"},
            {"$set": {"status": "failed", "error": "interrupted by restart", "finishedAt": datetime.now(UTC).isoformat()}},
        )
        return result.modified_count


def get_subodha_job_repo(db: AsyncDatabase = Depends(get_db)) -> SubodhaJobRepository:
    return SubodhaJobRepository(db)
