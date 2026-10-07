"""Subodha sync service — orchestrates fetch -> adapt -> process -> persist,
using the universal content_aggregators pipeline (SubodhaAdapter + strategies).
"""
from __future__ import annotations

import asyncio
import logging
import mimetypes
import re
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import unquote

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.models import SourceType
from app.aggregators.subodha_adapter import SubodhaAdapter
from app.aggregators.sync_job_models import SyncItemStatus, SyncStats
from app.models.responses.content_aggregator import SyncedCourseSummary
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider, get_blob_storage_provider
from app.providers.subodha_client import SubodhaClient, SubodhaCourse, get_subodha_client
from app.serializers.subodha_serializer import LegacyCourseDoc, to_course_doc
from app.services.content_aggregator_source_service import (
    ContentAggregatorSourceService,
    CourseDiffResult,
    CourseOutcome,
)
from app.services.content_aggregator_sync_jobs import SyncJobService, get_sync_job_service

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
    container = settings.content_aggregator_asset_container
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


class SubodhaService(ContentAggregatorSourceService):
    SOURCE_TYPE = SourceType.SUBODHA

    def __init__(
        self, db: AsyncDatabase, blob: BlobStorageProvider, client: SubodhaClient, sync_jobs: SyncJobService
    ) -> None:
        super().__init__(db, blob, sync_jobs)
        self._client = client
        self._adapter = SubodhaAdapter()

    async def list_live_courses(self) -> list[SubodhaCourse]:
        return await self._client.list_all_courses()

    async def get_course_diff(self, tenant_id: str) -> CourseDiffResult[SubodhaCourse]:
        live_courses, stored_ids = await asyncio.gather(
            self._client.list_all_courses(), self._repo.stored_root_ids(tenant_id, self.SOURCE_TYPE)
        )
        return self._diff_courses(live_courses, stored_ids, lambda c: c["id"])

    async def get_content_list(
        self, tenant_id: str, *, cursor: str = "", limit: int = 20
    ) -> list[SyncedCourseSummary]:
        roots = await self._repo.list_roots(tenant_id, self.SOURCE_TYPE, cursor=cursor, limit=limit + 1)
        return [
            SyncedCourseSummary(
                id=r.source_id,
                name=r.display_name,
                org=r.source_metadata.get("org") or "",
                number=r.source_metadata.get("course_number") or "",
                language=r.source_metadata.get("language") or "",
                hidden=bool(r.source_metadata.get("hidden")),
                synced=True,
                lastSyncedAt=r.fetched_at,
                lastRunId=r.last_run_id,
            )
            for r in roots
        ]

    async def get_course(self, tenant_id: str, source_id: str) -> LegacyCourseDoc:
        if not await self._repo.is_enrolled(tenant_id, self.SOURCE_TYPE, source_id):
            raise NotFoundError(f"{self.SOURCE_TYPE} course", source_id)
        tree = await self._repo.get_tree(tenant_id, self.SOURCE_TYPE, source_id)
        if not tree:
            raise NotFoundError(f"{self.SOURCE_TYPE} course", source_id)
        await self._apply_overrides(tenant_id, tree)
        return await to_course_doc(tree, self._blob)

    async def process_course(
        self, tenant_id: str, course: SubodhaCourse, session_cookie: str, run_id: str, dry_run: bool
    ) -> CourseOutcome:
        course_id = course["id"]
        logger.info("[subodha-process] course=%s start dry_run=%s", course_id, dry_run)
        try:
            blocks_response = await self._client.fetch_blocks(course_id, session_cookie)

            if self._adapter.is_empty(blocks_response):
                logger.info("[subodha-process] course=%s empty", course_id)
                return CourseOutcome(SyncItemStatus.EMPTY)

            await self._client.enrich_blocks_with_content(blocks_response, session_cookie)
            url_map = {} if dry_run else await fetch_and_store_assets(self._client, course_id, blocks_response, session_cookie)
            nodes = self._adapter.build_canonical_nodes(course, blocks_response, run_id, url_map)
            content_hash = self._adapter.compute_content_hash(nodes)

            if dry_run:
                logger.info("[subodha-process] course=%s skipped (dry_run)", course_id)
                return CourseOutcome(SyncItemStatus.SKIPPED)

            if await self._repo.get_root_content_hash(tenant_id, self.SOURCE_TYPE, course_id) == content_hash:
                logger.info("[subodha-process] course=%s skipped (unchanged content_hash)", course_id)
                return CourseOutcome(SyncItemStatus.SKIPPED)

            processed = await self._adapter.process_nodes(nodes, self._blob_ctx_factory(course_id, "courses"), self._blob)
            for node in processed:
                if node.parent_id is None:
                    node.source_metadata["content_hash"] = content_hash
            await self._repo.upsert_tree(tenant_id, self.SOURCE_TYPE, course_id, processed)
            logger.info("[subodha-process] course=%s saved nodes=%d", course_id, len(processed))
            return CourseOutcome(SyncItemStatus.SAVED)
        except Exception as exc:  # noqa: BLE001
            logger.exception("[subodha-process] course=%s failed: %s", course_id, exc)
            return CourseOutcome(SyncItemStatus.FAILED, str(exc))

    async def run_sync(
        self, tenant_id: str, job_id: str, *, only_new: bool, limit: int, dry_run: bool
    ) -> None:
        logger.info("[subodha] run %s started (dryRun=%s)", job_id, dry_run)

        session_cookie = await self._client.get_session()
        logger.info("[subodha] run %s session acquired", job_id)
        to_process = await self.list_live_courses()
        if only_new:
            stored_ids = await self._repo.stored_root_ids(tenant_id, self.SOURCE_TYPE)
            to_process = [c for c in to_process if c["id"] not in stored_ids]
        if limit:
            to_process = to_process[:limit]

        logger.info("[subodha] %d courses queued", len(to_process))
        await self._sync_jobs.set_total(tenant_id, job_id, len(to_process))

        semaphore = asyncio.Semaphore(self._settings.subodha_course_concurrency)
        session_box = {"cookie": session_cookie}
        lock = asyncio.Lock()
        processed_count = 0

        async def process_one(course: SubodhaCourse) -> None:
            nonlocal processed_count
            async with semaphore:
                async with lock:
                    needs_refresh = processed_count and processed_count % self._settings.subodha_session_refresh_every == 0
                if needs_refresh:
                    logger.info("[subodha] refreshing session at processed_count=%d", processed_count)
                    self._client.clear_session_cache()
                    new_cookie = await self._client.get_session()
                    async with lock:
                        session_box["cookie"] = new_cookie

                async with lock:
                    cookie = session_box["cookie"]

                outcome = await self.process_course(tenant_id, course, cookie, job_id, dry_run)
                await self._record_outcome(tenant_id, job_id, course["id"], course.get("name") or "", outcome)

                async with lock:
                    processed_count += 1

                if self._settings.subodha_course_delay_ms > 0:
                    await asyncio.sleep(self._settings.subodha_course_delay_ms / 1000)

        await asyncio.gather(*(process_one(c) for c in to_process))

        items = await self._sync_jobs.list_items(tenant_id, job_id)
        logger.info("[subodha] done -> %s", SyncStats.from_items(items).to_doc())

    async def run_single_course_sync(
        self, tenant_id: str, job_id: str, course_id: str, *, dry_run: bool
    ) -> None:
        logger.info("[subodha] single-course run %s started course=%s dry_run=%s", job_id, course_id, dry_run)

        session_cookie = await self._client.get_session()
        all_courses = await self._client.list_all_courses()
        course = next((c for c in all_courses if c["id"] == course_id), None)
        if course is None:
            logger.error("[subodha] single-course run %s: course=%s not found among %d live courses", job_id, course_id, len(all_courses))
            raise ValueError(f"Course not found on Subodha: {course_id}")

        await self._sync_jobs.set_total(tenant_id, job_id, 1)
        outcome = await self.process_course(tenant_id, course, session_cookie, job_id, dry_run)
        await self._record_outcome(tenant_id, job_id, course_id, course.get("name") or "", outcome)

        items = await self._sync_jobs.list_items(tenant_id, job_id)
        logger.info("[subodha] single-course done -> %s", SyncStats.from_items(items).to_doc())


def get_subodha_service(db: AsyncDatabase = Depends(get_db)) -> SubodhaService:
    return SubodhaService(db, get_blob_storage_provider(), get_subodha_client(), get_sync_job_service(db))
