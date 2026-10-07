from __future__ import annotations

import asyncio
import logging

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.hexis_adapter import HexisAdapter, HexisSubject
from app.aggregators.hexis_types import HexisContentItem
from app.aggregators.models import SourceType
from app.aggregators.sync_job_models import SyncItemStatus
from app.models.responses.content_aggregator import SyncedCourseSummary
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.providers.blob_storage import BlobStorageProvider
from app.providers.hexis_client import HexisClient, get_hexis_client
from app.serializers.hexis_serializer import to_course_doc
from app.serializers.subodha_serializer import LegacyCourseDoc
from app.services.content_aggregator_source_service import (
    ContentAggregatorSourceService,
    CourseDiffResult,
    CourseOutcome,
    LiveCourse,
)
from app.services.content_aggregator_sync_jobs import SyncJobService, get_sync_job_service

logger = logging.getLogger(__name__)


def _subjects_from_items(items: list[HexisContentItem], name_by_id: dict[str, str]) -> list[HexisSubject]:
    by_subject: dict[str, list[HexisContentItem]] = {}
    for it in items:
        by_subject.setdefault(str(it["subject"]), []).append(it)
    return [
        HexisSubject(subject_id=sid, name=name_by_id.get(sid) or f"Subject {sid}", items=its)
        for sid, its in by_subject.items()
    ]


class HexisService(ContentAggregatorSourceService):
    SOURCE_TYPE = SourceType.HEXIS

    def __init__(
        self, db: AsyncDatabase, blob: BlobStorageProvider, client: HexisClient, sync_jobs: SyncJobService
    ) -> None:
        super().__init__(db, blob, sync_jobs)
        self._client = client
        self._adapter = HexisAdapter()

    async def list_live_courses(self) -> list[HexisSubject]:
        items = await self._client.list_content(self._settings.hexis_admin_aid)
        return _subjects_from_items(items, await self._client.get_subjects())

    async def get_course_diff(self, tenant_id: str) -> CourseDiffResult[LiveCourse]:
        subjects, stored_ids = await asyncio.gather(
            self.list_live_courses(), self._repo.stored_root_ids(tenant_id, self.SOURCE_TYPE)
        )
        live: list[LiveCourse] = [{"id": s.subject_id, "name": s.name} for s in subjects]
        return self._diff_courses(live, stored_ids, lambda c: c["id"])

    async def get_content_list(
        self, tenant_id: str, *, cursor: str = "", limit: int = 20
    ) -> list[SyncedCourseSummary]:
        roots = await self._repo.list_roots(tenant_id, self.SOURCE_TYPE, cursor=cursor, limit=limit + 1)
        return [
            SyncedCourseSummary(
                id=r.source_id,
                name=r.display_name,
                org=r.source_metadata["subject"],
                number="",
                language="",
                hidden=False,
                synced=True,
                lastSyncedAt=r.fetched_at,
                lastRunId=r.last_run_id,
            )
            for r in roots
        ]

    async def get_course(self, tenant_id: str, source_id: str) -> LegacyCourseDoc:
        tree = await self._repo.get_tree(tenant_id, self.SOURCE_TYPE, source_id)
        if not tree:
            raise NotFoundError(f"{self.SOURCE_TYPE} course", source_id)
        await self._apply_overrides(tenant_id, tree)
        return await to_course_doc(tree, self._blob)

    async def process_course(
        self, tenant_id: str, subject: HexisSubject, run_id: str, dry_run: bool
    ) -> CourseOutcome:
        try:
            if self._adapter.is_empty(subject.items):
                return CourseOutcome(SyncItemStatus.EMPTY)

            nodes = self._adapter.build_canonical_nodes(subject, subject.items, run_id)
            content_hash = self._adapter.compute_content_hash(nodes)

            if dry_run:
                return CourseOutcome(SyncItemStatus.SKIPPED)

            if await self._repo.get_root_content_hash(tenant_id, self.SOURCE_TYPE, subject.subject_id) == content_hash:
                return CourseOutcome(SyncItemStatus.SKIPPED)

            processed = await self._adapter.process_nodes(nodes, self._blob_ctx_factory(subject.subject_id, "hexis"), self._blob)
            for node in processed:
                if node.parent_id is None:
                    node.source_metadata["content_hash"] = content_hash
            await self._repo.upsert_tree(tenant_id, self.SOURCE_TYPE, subject.subject_id, processed)
            return CourseOutcome(SyncItemStatus.SAVED)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[hexis-process] subject=%s failed", subject.subject_id)
            return CourseOutcome(SyncItemStatus.FAILED, str(exc))

    async def _sync_subject(self, tenant_id: str, job_id: str, subject: HexisSubject, dry_run: bool) -> None:
        outcome = await self.process_course(tenant_id, subject, job_id, dry_run)
        await self._record_outcome(tenant_id, job_id, subject.subject_id, subject.name, outcome)

    async def run_sync(
        self, tenant_id: str, job_id: str, *, only_new: bool, limit: int, dry_run: bool
    ) -> None:
        to_process = await self.list_live_courses()
        if only_new:
            stored_ids = await self._repo.stored_root_ids(tenant_id, self.SOURCE_TYPE)
            to_process = [s for s in to_process if s.subject_id not in stored_ids]
        if limit:
            to_process = to_process[:limit]

        await self._sync_jobs.set_total(tenant_id, job_id, len(to_process))

        semaphore = asyncio.Semaphore(self._settings.hexis_course_concurrency)

        async def process_one(subject: HexisSubject) -> None:
            async with semaphore:
                await self._sync_subject(tenant_id, job_id, subject, dry_run)

        await asyncio.gather(*(process_one(s) for s in to_process))

    async def run_single_course_sync(self, tenant_id: str, job_id: str, course_id: str, *, dry_run: bool) -> None:
        subject = next((s for s in await self.list_live_courses() if s.subject_id == course_id), None)
        if subject is None:
            raise ValueError(f"Subject not found on Hexis: {course_id}")

        await self._sync_jobs.set_total(tenant_id, job_id, 1)
        await self._sync_subject(tenant_id, job_id, subject, dry_run)


def get_hexis_service(db: AsyncDatabase = Depends(get_db)) -> HexisService:
    return HexisService(db, BlobStorageProvider(), get_hexis_client(), get_sync_job_service(db))
