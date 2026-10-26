from __future__ import annotations

import asyncio
import logging
from typing import ClassVar

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.iris_adapter import IrisAdapter
from app.aggregators.iris_types import IrisBook
from app.aggregators.models import SourceType
from app.aggregators.sync_job_models import SyncItemStatus
from app.platform.auth.dependencies import get_db
from app.providers.blob_storage import BlobStorageProvider
from app.providers.iris_client import IrisClient, get_iris_client
from app.services.content_aggregator_source_service import (
    CourseDiffResult,
    CourseOutcome,
    LiveCourse,
)
from app.services.content_aggregator_sync_jobs import SyncJobService, get_sync_job_service
from app.services.stored_content_service import StoredContentService

logger = logging.getLogger(__name__)


class IrisService(StoredContentService):
    SOFT_DELETE_ABSENT: ClassVar[bool] = True

    def __init__(
        self, db: AsyncDatabase, blob: BlobStorageProvider, client: IrisClient, sync_jobs: SyncJobService
    ) -> None:
        super().__init__(db, blob, sync_jobs, SourceType.IRIS)
        self._client = client
        self._adapter = IrisAdapter()

    async def list_live_courses(self) -> list[IrisBook]:
        return await self._client.list_books()

    async def get_course_diff(self, tenant_id: str) -> CourseDiffResult[LiveCourse]:
        books, stored_ids = await asyncio.gather(
            self.list_live_courses(), self._repo.stored_root_ids(tenant_id, self.SOURCE_TYPE)
        )
        live: list[LiveCourse] = [{"id": b.book_id, "name": b.name} for b in books]
        return self._diff_courses(live, stored_ids, lambda c: c["id"])

    async def process_course(
        self, tenant_id: str, book: IrisBook, run_id: str, dry_run: bool
    ) -> CourseOutcome:
        try:
            tactiles = await self._client.list_tactiles(book.book_id)
            if self._adapter.is_empty(tactiles):
                return CourseOutcome(SyncItemStatus.EMPTY)

            nodes = self._adapter.build_canonical_nodes(book, tactiles, run_id)
            content_hash = self._adapter.compute_content_hash(nodes)
            return await self._save_nodes(
                tenant_id, book.book_id, nodes, content_hash, self._adapter,
                self._blob_ctx_factory(book.book_id, "iris"), dry_run=dry_run,
            )
        except Exception as exc:
            logger.exception("[iris-process] book=%s failed", book.book_id)
            return CourseOutcome(SyncItemStatus.FAILED, str(exc))

    async def _sync_book(self, tenant_id: str, job_id: str, book: IrisBook, dry_run: bool) -> None:
        outcome = await self.process_course(tenant_id, book, job_id, dry_run)
        await self._record_outcome(tenant_id, job_id, book.book_id, book.name, outcome)

    async def run_sync(
        self, tenant_id: str, job_id: str, *, only_new: bool, limit: int, dry_run: bool
    ) -> None:
        to_process = await self.list_live_courses()
        if only_new:
            stored_ids = await self._repo.stored_root_ids(tenant_id, self.SOURCE_TYPE)
            to_process = [b for b in to_process if b.book_id not in stored_ids]
        if limit:
            to_process = to_process[:limit]

        await self._sync_jobs.set_total(tenant_id, job_id, len(to_process))

        semaphore = asyncio.Semaphore(self._settings.iris_book_concurrency)

        async def process_one(book: IrisBook) -> None:
            async with semaphore:
                await self._sync_book(tenant_id, job_id, book, dry_run)

        await asyncio.gather(*(process_one(b) for b in to_process))

    async def run_single_course_sync(self, tenant_id: str, job_id: str, course_id: str, *, dry_run: bool) -> None:
        book = next((b for b in await self.list_live_courses() if b.book_id == course_id), None)
        if book is None:
            raise ValueError(f"Book not found on Iris: {course_id}")

        await self._sync_jobs.set_total(tenant_id, job_id, 1)
        await self._sync_book(tenant_id, job_id, book, dry_run)


def get_iris_service(db: AsyncDatabase = Depends(get_db)) -> IrisService:
    return IrisService(db, BlobStorageProvider(), get_iris_client(), get_sync_job_service(db))
