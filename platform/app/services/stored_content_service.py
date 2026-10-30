from __future__ import annotations

from collections.abc import Callable

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.models import SourceType
from app.models.responses.content_aggregator import SyncedCourseSummary
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import AppError, NotFoundError
from app.providers.blob_storage import BlobStorageProvider
from app.serializers.content_aggregator_serializer import to_course_doc
from app.serializers.subodha_serializer import LegacyCourseDoc
from app.services.content_aggregator_source_service import (
    ContentAggregatorSourceService,
    CourseDiffResult,
    LiveCourse,
)
from app.services.content_aggregator_sync_jobs import SyncJobService, get_sync_job_service


class StoredContentService(ContentAggregatorSourceService):
    def __init__(
        self, db: AsyncDatabase, blob: BlobStorageProvider, sync_jobs: SyncJobService, source_type: SourceType
    ) -> None:
        super().__init__(db, blob, sync_jobs)
        self.SOURCE_TYPE = source_type

    async def get_course_diff(self, tenant_id: str) -> CourseDiffResult[LiveCourse]:
        stored_ids = await self._repo.stored_root_ids(tenant_id, self.SOURCE_TYPE)
        return self._diff_courses([], stored_ids, lambda c: c["id"])

    async def get_content_list(
        self, tenant_id: str, *, cursor: str = "", limit: int = 20
    ) -> list[SyncedCourseSummary]:
        roots = await self._repo.list_roots(tenant_id, self.SOURCE_TYPE, cursor=cursor, limit=limit + 1)
        return [
            SyncedCourseSummary(
                id=r.source_id,
                name=r.display_name,
                org="",
                number="",
                language="",
                hidden=False,
                synced=True,
                last_synced_at=r.fetched_at,
                last_run_id=r.last_run_id,
            )
            for r in roots
        ]

    async def get_course(self, tenant_id: str, source_id: str) -> LegacyCourseDoc:
        tree = await self._repo.get_tree(tenant_id, self.SOURCE_TYPE, source_id)
        if not tree:
            raise NotFoundError(f"{self.SOURCE_TYPE} course", source_id)
        await self._apply_overrides(tenant_id, tree)
        return await to_course_doc(tree, self._blob)

    async def run_sync(
        self, tenant_id: str, job_id: str, *, only_new: bool, limit: int, dry_run: bool
    ) -> None:
        raise AppError("SYNC_NOT_SUPPORTED", f"{self.SOURCE_TYPE} content can no longer be synced", 400)

    async def run_single_course_sync(
        self, tenant_id: str, job_id: str, course_id: str, *, dry_run: bool
    ) -> None:
        raise AppError("SYNC_NOT_SUPPORTED", f"{self.SOURCE_TYPE} content can no longer be synced", 400)


def get_stored_content_service(source_type: SourceType) -> Callable[..., StoredContentService]:
    def dependency(db: AsyncDatabase = Depends(get_db)) -> StoredContentService:
        return StoredContentService(db, BlobStorageProvider(), get_sync_job_service(db), source_type)

    return dependency
