"""Subodha sync service — orchestrates fetch -> adapt -> process -> persist,
using the universal content_aggregators pipeline (SubodhaAdapter + strategies).
"""
from __future__ import annotations

import asyncio
import logging
import mimetypes
import re
from datetime import UTC, datetime
from pathlib import PurePosixPath
from typing import Any, TypedDict
from urllib.parse import unquote

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.models import BlobContext, QuizContent
from app.aggregators.source_types import CollectedUnits, SourceRecord
from app.aggregators.subodha_adapter import SubodhaAdapter
from app.aggregators.sync_job_models import SyncItemResult
from app.platform.auth.dependencies import get_db
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.providers.subodha_client import SubodhaClient, SubodhaCourse
from app.repositories.content_aggregator_item_override_repository import (
    ContentAggregatorItemOverrideRepository,
)
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_aggregator_sync_job_item_repository import (
    ContentAggregatorSyncJobItemRepository,
)
from app.repositories.content_aggregator_sync_job_repository import (
    ContentAggregatorSyncJobRepository,
)
from app.serializers.subodha_serializer import LegacyCourseDoc, to_course_doc
from app.services.content_aggregator_sync_jobs import record_item_result, set_total


class CourseDiffResult(TypedDict):
    totalLive: int
    totalStored: int
    newCount: int
    removedCount: int
    newCourseIds: list[str]
    removedCourseIds: list[str]
    liveCourses: list[SubodhaCourse]


logger = logging.getLogger(__name__)

_ASSET_URL_RE = re.compile(r'(?:/assets/courseware/v1/[^/"\']+)?/asset-v1:[^"\'\s)>,;&]+')


def _asset_filename(asset_url: str) -> str:
    m = re.search(r"block@(.+)$", asset_url)
    return unquote(m.group(1)) if m else PurePosixPath(asset_url).name


async def fetch_and_store_assets(
    client: SubodhaClient, course_id: str, blocks_response: dict[str, Any], session_cookie: str
) -> dict[str, str]:
    all_blocks = (blocks_response.get("blocks") or {}).values()
    asset_urls = sorted({m for b in all_blocks for m in _ASSET_URL_RE.findall(b.get("student_view_html") or "")})
    if not asset_urls:
        logger.info("[subodha-assets] %s: no assets referenced", course_id)
        return {}
    logger.info("[subodha-assets] %s: %d asset urls to fetch", course_id, len(asset_urls))

    settings = get_settings()
    container = settings.subodha_asset_container
    safe_course_id = re.sub(r"[:/+]", "_", course_id)
    blob_provider = BlobStorageProvider()
    semaphore = asyncio.Semaphore(settings.subodha_asset_concurrency)
    url_map: dict[str, str] = {}
    stats = {"saved": 0, "failed": 0}

    async def upload_one(relative_url: str) -> None:
        async with semaphore:
            file_name = _asset_filename(relative_url)
            blob_name = f"courses/{safe_course_id}/assets/{file_name}"
            try:
                if await blob_provider.exists(container, blob_name):
                    url_map[relative_url] = blob_provider.get_container_client(container).get_blob_client(blob_name).url
                else:
                    data = await client.fetch_asset(relative_url, session_cookie)
                    content_type = mimetypes.guess_type(file_name)[0] or "application/octet-stream"
                    url_map[relative_url] = await blob_provider.upload_file(container, blob_name, data, content_type)
                stats["saved"] += 1
            except Exception as exc:  # noqa: BLE001
                logger.warning("[subodha-assets] SKIP %s: %s", relative_url, exc)
                stats["failed"] += 1

    await asyncio.gather(*(upload_one(u) for u in asset_urls))
    logger.info("[subodha-assets] %s: %d saved, %d failed", course_id, stats["saved"], stats["failed"])
    return url_map


class SubodhaService:
    SOURCE_TYPE = "subodha"

    def __init__(self, db: AsyncDatabase, blob: BlobStorageProvider | None = None) -> None:
        self._repo = ContentAggregatorRepository(db)
        self._override_repo = ContentAggregatorItemOverrideRepository(db)
        self._blob = blob if blob is not None else BlobStorageProvider()
        self._settings = get_settings()
        self._adapter = SubodhaAdapter()

    async def update_problem_block(
        self, tenant_id: str, course_id: str, block_id: str, question: str, choices: list[dict[str, str]]
    ) -> int:
        tree = await self._repo.get_tree(tenant_id, self.SOURCE_TYPE, course_id)
        existing = next((n for n in tree if n.source_id == block_id), None)
        if existing is None or not isinstance(existing.content, QuizContent):
            return 0
        await self._override_repo.upsert(tenant_id, self.SOURCE_TYPE, block_id, question, choices)
        return 1

    async def get_course_diff(self, tenant_id: str, client: SubodhaClient) -> CourseDiffResult:
        live_courses, stored_ids = await asyncio.gather(
            client.list_all_courses(), self._repo.stored_root_ids(tenant_id, self.SOURCE_TYPE)
        )
        live_ids = {c["id"] for c in live_courses}
        new_courses = [c for c in live_courses if c["id"] not in stored_ids]
        removed_ids = [i for i in stored_ids if i not in live_ids]
        logger.info(
            "[subodha-diff] tenant=%s live=%d stored=%d new=%d removed=%d",
            tenant_id, len(live_courses), len(stored_ids), len(new_courses), len(removed_ids),
        )
        return {
            "totalLive": len(live_courses),
            "totalStored": len(stored_ids),
            "newCount": len(new_courses),
            "removedCount": len(removed_ids),
            "newCourseIds": [c["id"] for c in new_courses],
            "removedCourseIds": removed_ids,
            "liveCourses": live_courses,
        }

    async def get_content_list(
        self, tenant_id: str, *, cursor: str | None = None, limit: int = 20
    ) -> list[dict[str, Any]]:
        roots = await self._repo.list_roots(tenant_id, self.SOURCE_TYPE, cursor=cursor, limit=limit + 1)
        return [
            {
                "id": r.source_id,
                "name": r.display_name,
                "org": r.source_metadata.get("org"),
                "number": r.source_metadata.get("course_number"),
                "language": r.source_metadata.get("language"),
                "hidden": r.source_metadata.get("hidden"),
                "synced": True,
                "lastSyncedAt": r.fetched_at,
                "lastRunId": r.last_run_id,
            }
            for r in roots
        ]

    async def get_course(self, tenant_id: str, source_id: str) -> LegacyCourseDoc | None:
        tree = await self._repo.get_tree(tenant_id, self.SOURCE_TYPE, source_id)
        if not tree:
            return None
        overrides = await self._override_repo.list_by_tree(tenant_id, self.SOURCE_TYPE, [n.source_id for n in tree])
        for node in tree:
            override = overrides.get(node.source_id)
            if override and isinstance(node.content, QuizContent):
                node.content = QuizContent(
                    raw_html_url=node.content.raw_html_url,
                    question=override["question"],
                    choices=override["choices"],
                )
        return await to_course_doc(tree, self._blob)

    async def delete_course(self, tenant_id: str, source_id: str) -> int:
        return await self._repo.delete_tree(tenant_id, self.SOURCE_TYPE, source_id)

    def _blob_ctx_factory(self, course_id: str):
        safe_course_id = re.sub(r"[:/+]", "_", course_id)

        def factory(node) -> BlobContext:
            safe_block_id = re.sub(r"[:/+@]", "_", node.source_id)
            return BlobContext(container=self._settings.subodha_asset_container, blob_prefix=f"courses/{safe_course_id}/items/{safe_block_id}")

        return factory

    async def process_course(
        self, tenant_id: str, client: SubodhaClient, course: SubodhaCourse, session_cookie: str, run_id: str, dry_run: bool
    ) -> dict[str, Any]:
        course_id = course["id"]
        logger.info("[subodha-process] course=%s start dry_run=%s", course_id, dry_run)
        try:
            blocks_response = await client.fetch_blocks(course_id, session_cookie)

            if self._adapter.is_empty(blocks_response):
                logger.info("[subodha-process] course=%s empty", course_id)
                return {"status": "empty", "courseId": course_id}

            await client.enrich_blocks_with_content(blocks_response, session_cookie)
            url_map = {} if dry_run else await fetch_and_store_assets(client, course_id, blocks_response, session_cookie)
            nodes = self._adapter.build_canonical_nodes(course, blocks_response, run_id, url_map)
            content_hash = self._adapter.compute_content_hash(nodes)

            if dry_run:
                logger.info("[subodha-process] course=%s skipped (dry_run)", course_id)
                return {"status": "skipped", "courseId": course_id}

            existing_root = await self._repo.get_root(tenant_id, self.SOURCE_TYPE, course_id)
            if existing_root is not None and existing_root.source_metadata.get("content_hash") == content_hash:
                logger.info("[subodha-process] course=%s skipped (unchanged content_hash)", course_id)
                return {"status": "skipped", "courseId": course_id}

            for node in nodes:
                node.tenant_id = tenant_id
            processed = await self._adapter.process_nodes(nodes, self._blob_ctx_factory(course_id), self._blob)
            for node in processed:
                if node.parent_id is None:
                    node.source_metadata["content_hash"] = content_hash
            await self._repo.upsert_tree(tenant_id, self.SOURCE_TYPE, course_id, processed)
            logger.info("[subodha-process] course=%s saved nodes=%d", course_id, len(processed))
            return {"status": "saved", "courseId": course_id}
        except Exception as exc:  # noqa: BLE001
            logger.exception("[subodha-process] course=%s failed: %s", course_id, exc)
            return {"status": "failed", "courseId": course_id, "error": str(exc)}

    async def collect_units(
        self, client: SubodhaClient, *, course_ids: list[str] | None = None, limit: int | None = None
    ) -> CollectedUnits:
        """Collect units to sync (no writes) — lets a combined multi-source run
        sum totals before setting job progress."""
        session_cookie = await client.get_session()
        all_courses = await client.list_all_courses()
        logger.info("[subodha] session acquired")
        to_process = all_courses
        if course_ids is not None:
            wanted = set(course_ids)
            to_process = [c for c in all_courses if c["id"] in wanted]
        if limit is not None:
            to_process = to_process[:limit]
        return CollectedUnits(session=session_cookie, units=to_process, total_available=len(all_courses))

    async def sync_units(
        self, tenant_id: str, client: SubodhaClient, job_repo: ContentAggregatorSyncJobRepository,
        item_repo: ContentAggregatorSyncJobItemRepository, job_id: str,
        session: str, units: list[SourceRecord], *, dry_run: bool = False,
    ) -> None:
        """Process units concurrently, recording each result on job_id. Does NOT
        call set_total — the caller owns the (possibly combined) total."""
        semaphore = asyncio.Semaphore(self._settings.subodha_course_concurrency)
        session_box = {"cookie": session}
        lock = asyncio.Lock()
        processed_count = 0

        async def process_one(course: SubodhaCourse) -> None:
            nonlocal processed_count
            async with semaphore:
                async with lock:
                    needs_refresh = processed_count and processed_count % self._settings.subodha_session_refresh_every == 0
                if needs_refresh:
                    logger.info("[subodha] refreshing session at processed_count=%d", processed_count)
                    client.clear_session_cache()
                    new_cookie = await client.get_session()
                    async with lock:
                        session_box["cookie"] = new_cookie

                async with lock:
                    cookie = session_box["cookie"]

                result = await self.process_course(tenant_id, client, course, cookie, job_id, dry_run)
                entry = SyncItemResult(
                    source_id=result["courseId"], name=course.get("name") or "", status=result["status"],
                    error=result.get("error"), at=datetime.now(UTC).isoformat(),
                )
                await record_item_result(job_repo, item_repo, tenant_id, job_id, entry)

                async with lock:
                    processed_count += 1

                if self._settings.subodha_course_delay_ms > 0:
                    await asyncio.sleep(self._settings.subodha_course_delay_ms / 1000)

        await asyncio.gather(*(process_one(c) for c in units))

    async def run_single_course_sync(
        self,
        tenant_id: str,
        client: SubodhaClient,
        job_repo: ContentAggregatorSyncJobRepository,
        item_repo: ContentAggregatorSyncJobItemRepository,
        job_id: str,
        course_id: str,
        *,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        started_at = datetime.now(UTC).isoformat()
        logger.info("[subodha] single-course run %s started course=%s dry_run=%s", job_id, course_id, dry_run)

        session_cookie = await client.get_session()
        all_courses = await client.list_all_courses()
        course = next((c for c in all_courses if c["id"] == course_id), None)
        if course is None:
            logger.error("[subodha] single-course run %s: course=%s not found among %d live courses", job_id, course_id, len(all_courses))
            raise ValueError(f"Course not found on Subodha: {course_id}")

        await set_total(job_repo, item_repo, tenant_id, job_id, 1)
        result = await self.process_course(tenant_id, client, course, session_cookie, job_id, dry_run)
        entry = SyncItemResult(
            source_id=result["courseId"], name=course.get("name") or "", status=result["status"],
            error=result.get("error"), at=datetime.now(UTC).isoformat(),
        )
        await record_item_result(job_repo, item_repo, tenant_id, job_id, entry)

        stats = (await item_repo.get_stats(tenant_id, job_id)).to_doc()
        permanent_failures = (
            [{"courseId": course_id, "error": result.get("error", "")}] if result["status"] == "failed" else []
        )
        return {
            "runId": job_id,
            "startedAt": started_at,
            "finishedAt": datetime.now(UTC).isoformat(),
            "totalCourses": 1,
            "processed": 1,
            "stats": stats,
            "permanentFailures": permanent_failures,
            "dlqProcessed": 0,
        }


_service: SubodhaService | None = None


def get_subodha_service(db: AsyncDatabase = Depends(get_db)) -> SubodhaService:
    """Return the process-wide SubodhaService singleton."""
    global _service  # noqa: PLW0603
    if _service is None:
        _service = SubodhaService(db)
    return _service
