from __future__ import annotations

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.models import SourceType
from app.models.responses.content_aggregator import SyncedCourseSummary
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.providers.blob_storage import BlobStorageProvider
from app.serializers.content_aggregator_serializer import to_course_doc
from app.serializers.subodha_serializer import LegacyCourseDoc
from app.services.content_aggregator_sync_jobs import SyncJobService, get_sync_job_service
from app.services.stored_content_service import StoredContentService


class HexisService(StoredContentService):
    def __init__(
        self, db: AsyncDatabase, blob: BlobStorageProvider, sync_jobs: SyncJobService
    ) -> None:
        super().__init__(db, blob, sync_jobs, SourceType.HEXIS)

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


def get_hexis_service(db: AsyncDatabase = Depends(get_db)) -> HexisService:
    return HexisService(db, BlobStorageProvider(), get_sync_job_service(db))
