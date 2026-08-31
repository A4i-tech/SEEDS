from __future__ import annotations

import asyncio
import logging
import re
from datetime import UTC, datetime
from typing import Any

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.hexis_adapter import HexisAdapter
from app.aggregators.models import QuizContent
from app.aggregators.source_types import CollectedUnits, SourceRecord
from app.aggregators.sync_job_models import SyncItemResult
from app.platform.auth.dependencies import get_db
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.providers.hexis_client import HexisClient
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.serializers.hexis_serializer import LegacyCourseDoc, to_course_doc
from app.services.content_aggregator_sync_jobs import record_item_result, set_total

logger = logging.getLogger(__name__)


def _subjects_from_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Group the content feed into per-subject buckets, preserving order."""
    by_subject: dict[str, dict[str, Any]] = {}
    for it in items:
        subject = str(it.get("subject") or "")
        bucket = by_subject.setdefault(subject, {"subject_id": subject, "items": []})
        bucket["items"].append(it)
    return list(by_subject.values())


class HexisService:
    SOURCE_TYPE = "hexis"

    def __init__(self, db: AsyncDatabase, blob: BlobStorageProvider | None = None) -> None:
        self._repo = ContentAggregatorRepository(db)
        self._blob = blob if blob is not None else BlobStorageProvider()
        self._settings = get_settings()
        self._adapter = HexisAdapter()

    async def update_problem_block(
        self, tenant_id: str, course_id: str, block_id: str, question: str, choices: list[dict[str, str]]
    ) -> int:
        tree = await self._repo.get_tree(tenant_id, self.SOURCE_TYPE, course_id)
        existing = next((n for n in tree if n.source_id == block_id), None)
        if existing is None or not isinstance(existing.content, QuizContent):
            return 0
        updated = QuizContent(raw_html_url=existing.content.raw_html_url, question=question, choices=choices)
        return await self._repo.update_item_content(tenant_id, self.SOURCE_TYPE, block_id, updated)

    async def _all_subjects(self, client: HexisClient) -> list[dict[str, Any]]:
        items = await client.list_content(self._settings.hexis_admin_aid)
        name_by_id = await client.get_subjects()
        subjects = _subjects_from_items(items)
        for s in subjects:
            s["name"] = name_by_id.get(s["subject_id"]) or f"Subject {s['subject_id']}"
        return subjects

    async def get_course_diff(self, tenant_id: str, client: HexisClient) -> dict[str, Any]:
        subjects = await self._all_subjects(client)
        stored_ids = await self._repo.stored_root_ids(tenant_id, self.SOURCE_TYPE)
        live_ids = {s["subject_id"] for s in subjects}
        new_subjects = [s for s in subjects if s["subject_id"] not in stored_ids]
        removed_ids = [i for i in stored_ids if i not in live_ids]
        return {
            "totalLive": len(subjects),
            "totalStored": len(stored_ids),
            "newCount": len(new_subjects),
            "removedCount": len(removed_ids),
            "newCourseIds": [s["subject_id"] for s in new_subjects],
            "removedCourseIds": removed_ids,
            "liveCourses": [{"id": s["subject_id"], "name": s.get("name") or f"Subject {s['subject_id']}"} for s in subjects],
        }

    async def get_content_list(
        self, tenant_id: str, *, cursor: str | None = None, limit: int = 20
    ) -> list[dict[str, Any]]:
        roots = await self._repo.list_roots(tenant_id, self.SOURCE_TYPE, cursor=cursor, limit=limit + 1)
        return [
            {
                "id": r.source_id, "name": r.display_name,
                "org": r.source_metadata.get("subject"), "number": None,
                "language": None, "hidden": None, "synced": True,
                "lastSyncedAt": r.fetched_at, "lastRunId": r.last_run_id,
            }
            for r in roots
        ]

    async def get_course(self, tenant_id: str, source_id: str) -> LegacyCourseDoc | None:
        tree = await self._repo.get_tree(tenant_id, self.SOURCE_TYPE, source_id)
        if not tree:
            return None
        return await to_course_doc(tree, self._blob)

    async def delete_course(self, tenant_id: str, source_id: str) -> int:
        return await self._repo.delete_tree(tenant_id, self.SOURCE_TYPE, source_id)

    def _blob_ctx_factory(self, subject_id: str):
        safe_subject = re.sub(r"[:/+@]", "_", subject_id)

        def factory(node):
            from app.aggregators.models import BlobContext

            safe_cid = re.sub(r"[:/+@]", "_", node.source_id)
            return BlobContext(container=self._settings.content_aggregator_asset_container, blob_prefix=f"hexis/{safe_subject}/items/{safe_cid}")

        return factory

    async def process_course(
        self, tenant_id: str, client: HexisClient, subject: dict[str, Any], session: str, run_id: str, dry_run: bool
    ) -> dict[str, Any]:
        subject_id = str(subject["subject_id"])
        try:
            items = subject.get("items", [])
            if self._adapter.is_empty(items):
                return {"status": "empty", "courseId": subject_id}

            nodes = self._adapter.build_canonical_nodes(subject, items, run_id, {})
            content_hash = self._adapter.compute_content_hash(nodes)

            if dry_run:
                return {"status": "skipped", "courseId": subject_id}

            existing_root = await self._repo.get_root(tenant_id, self.SOURCE_TYPE, subject_id)
            if existing_root is not None and existing_root.source_metadata.get("content_hash") == content_hash:
                return {"status": "skipped", "courseId": subject_id}

            for node in nodes:
                node.tenant_id = tenant_id
            processed = await self._adapter.process_nodes(nodes, self._blob_ctx_factory(subject_id), self._blob)
            for node in processed:
                if node.parent_id is None:
                    node.source_metadata["content_hash"] = content_hash
            await self._repo.upsert_tree(tenant_id, self.SOURCE_TYPE, subject_id, processed)
            return {"status": "saved", "courseId": subject_id}
        except Exception as exc:  # noqa: BLE001
            return {"status": "failed", "courseId": subject_id, "error": str(exc)}

    async def collect_units(
        self, client: HexisClient, *, course_ids: list[str] | None = None, limit: int | None = None
    ) -> CollectedUnits:
        session = await client.get_session()
        all_subjects = await self._all_subjects(client)
        to_process = all_subjects
        if course_ids is not None:
            wanted = set(course_ids)
            to_process = [s for s in all_subjects if s["subject_id"] in wanted]
        if limit is not None:
            to_process = to_process[:limit]
        return CollectedUnits(session=session, units=to_process, total_available=len(all_subjects))

    async def sync_units(
        self, tenant_id: str, client: HexisClient, job_repo: ContentAggregatorSyncJobRepository,
        item_repo: ContentAggregatorSyncJobItemRepository, job_id: str,
        session: str, units: list[SourceRecord], *, dry_run: bool = False,
    ) -> None:
        semaphore = asyncio.Semaphore(self._settings.hexis_course_concurrency)

        async def process_one(subject: dict[str, Any]) -> None:
            async with semaphore:
                result = await self.process_course(tenant_id, client, subject, session, job_id, dry_run)
                entry = SyncItemResult(
                    source_id=result["courseId"], name=subject.get("name") or f"Subject {subject['subject_id']}",
                    status=result["status"], error=result.get("error"), at=datetime.now(UTC).isoformat(),
                )
                await record_item_result(job_repo, item_repo, tenant_id, job_id, entry)

        await asyncio.gather(*(process_one(s) for s in units))

    async def run_single_course_sync(
        self,
        tenant_id: str,
        client: HexisClient,
        job_repo: ContentAggregatorSyncJobRepository,
        item_repo: ContentAggregatorSyncJobItemRepository,
        job_id: str,
        course_id: str,
        *,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        started_at = datetime.now(UTC).isoformat()
        session = await client.get_session()
        subject = next((s for s in await self._all_subjects(client) if s["subject_id"] == course_id), None)
        if subject is None:
            raise ValueError(f"Subject not found on Hexis: {course_id}")

        await set_total(job_repo, item_repo, tenant_id, job_id, 1)
        result = await self.process_course(tenant_id, client, subject, session, job_id, dry_run)
        entry = SyncItemResult(
            source_id=result["courseId"], name=subject.get("name") or f"Subject {subject['subject_id']}",
            status=result["status"], error=result.get("error"), at=datetime.now(UTC).isoformat(),
        )
        await record_item_result(job_repo, item_repo, tenant_id, job_id, entry)

        stats = (await item_repo.get_stats(tenant_id, job_id)).to_doc()
        permanent_failures = (
            [{"courseId": course_id, "error": result.get("error", "")}] if result["status"] == "failed" else []
        )
        return {
            "runId": job_id, "startedAt": started_at, "finishedAt": datetime.now(UTC).isoformat(),
            "totalCourses": 1, "processed": 1, "stats": stats,
            "permanentFailures": permanent_failures, "dlqProcessed": 0,
        }


def get_hexis_service(db: AsyncDatabase = Depends(get_db)) -> HexisService:
    return HexisService(db)
