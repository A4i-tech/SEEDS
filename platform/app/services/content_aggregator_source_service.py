from __future__ import annotations

import re
from abc import ABC, abstractmethod
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import ClassVar, TypedDict

from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.models import BlobContext, CanonicalNode, QuizChoice, QuizContent, SourceType
from app.aggregators.sync_job_models import SyncItemResult, SyncItemStatus, SyncJob, SyncJobStatus
from app.models.responses.content_aggregator import SyncedCourseSummary
from app.platform.error_handling import NotFoundError
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.repositories.content_aggregator_item_override_repository import (
    ContentAggregatorItemOverrideRepository,
)
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.serializers.subodha_serializer import LegacyCourseDoc
from app.services.content_aggregator_sync_jobs import SyncJobService


class LiveCourse(TypedDict):
    id: str
    name: str


@dataclass(frozen=True)
class CourseOutcome:
    status: SyncItemStatus
    error: str = ""


class CourseDiffResult[CourseT](TypedDict):
    totalLive: int
    totalStored: int
    newCount: int
    removedCount: int
    newCourseIds: list[str]
    removedCourseIds: list[str]
    liveCourses: list[CourseT]


class ContentAggregatorSourceService(ABC):
    SOURCE_TYPE: ClassVar[SourceType]

    def __init__(self, db: AsyncDatabase, blob: BlobStorageProvider, sync_jobs: SyncJobService) -> None:
        self._repo = ContentAggregatorRepository(db)
        self._override_repo = ContentAggregatorItemOverrideRepository(db)
        self._sync_jobs = sync_jobs
        self._blob = blob
        self._settings = get_settings()

    @abstractmethod
    async def get_course_diff(self, tenant_id: str) -> CourseDiffResult[LiveCourse]: ...

    @abstractmethod
    async def get_content_list(
        self, tenant_id: str, *, cursor: str = "", limit: int = 20
    ) -> list[SyncedCourseSummary]: ...

    @abstractmethod
    async def get_course(self, tenant_id: str, source_id: str) -> LegacyCourseDoc: ...

    @abstractmethod
    async def run_sync(
        self, tenant_id: str, job_id: str, *, only_new: bool, limit: int, dry_run: bool
    ) -> None: ...

    @abstractmethod
    async def run_single_course_sync(
        self, tenant_id: str, job_id: str, course_id: str, *, dry_run: bool
    ) -> None: ...

    async def claim_next_pending_job(self) -> SyncJob | None:
        return await self._sync_jobs.claim_next_pending_job(self.SOURCE_TYPE)

    async def finish_job(self, tenant_id: str, job_id: str, status: SyncJobStatus, *, error: str = "") -> None:
        await self._sync_jobs.finish_job(tenant_id, job_id, status, error=error)

    async def _record_outcome(
        self, tenant_id: str, job_id: str, source_id: str, name: str, outcome: CourseOutcome
    ) -> None:
        await self._sync_jobs.record_item_result(
            tenant_id, job_id,
            SyncItemResult(
                source_id=source_id, name=name, status=outcome.status, error=outcome.error,
                at=datetime.now(UTC).isoformat(),
            ),
        )

    def _diff_courses[CourseT](
        self, live_courses: list[CourseT], stored_ids: set[str], key: Callable[[CourseT], str]
    ) -> CourseDiffResult[CourseT]:
        live_ids = {key(c) for c in live_courses}
        new_courses = [c for c in live_courses if key(c) not in stored_ids]
        removed_ids = [i for i in stored_ids if i not in live_ids]
        return {
            "totalLive": len(live_courses), "totalStored": len(stored_ids),
            "newCount": len(new_courses), "removedCount": len(removed_ids),
            "newCourseIds": [key(c) for c in new_courses], "removedCourseIds": removed_ids,
            "liveCourses": live_courses,
        }

    def _blob_ctx_factory(self, root_id: str, prefix: str) -> Callable[[CanonicalNode], BlobContext]:
        safe_root = re.sub(r"[:/+@]", "_", root_id)

        def factory(node: CanonicalNode) -> BlobContext:
            safe_id = re.sub(r"[:/+@]", "_", node.source_id)
            return BlobContext(
                container=self._settings.content_aggregator_asset_container,
                blob_prefix=f"{prefix}/{safe_root}/items/{safe_id}",
            )

        return factory

    async def update_problem_block(
        self, tenant_id: str, course_id: str, block_id: str, question: str, choices: list[QuizChoice]
    ) -> None:
        tree = await self._repo.get_tree(tenant_id, self.SOURCE_TYPE, course_id)
        existing = next((n for n in tree if n.source_id == block_id), None)
        if existing is None or not isinstance(existing.content, QuizContent):
            raise NotFoundError(f"{self.SOURCE_TYPE} block", block_id)
        await self._override_repo.upsert(tenant_id, self.SOURCE_TYPE, block_id, question, choices)

    async def delete_course(self, tenant_id: str, source_id: str) -> int:
        deleted = await self._repo.delete_tree(tenant_id, self.SOURCE_TYPE, source_id)
        if not deleted:
            raise NotFoundError(f"{self.SOURCE_TYPE} course", source_id)
        return deleted

    async def _apply_overrides(self, tenant_id: str, tree: list[CanonicalNode]) -> None:
        overrides = await self._override_repo.list_by_tree(tenant_id, self.SOURCE_TYPE, [n.source_id for n in tree])
        for node in tree:
            override = overrides.get(node.source_id)
            if override and isinstance(node.content, QuizContent):
                node.content = QuizContent(
                    raw_html_url=node.content.raw_html_url,
                    question=override["question"],
                    choices=override["choices"],
                )
