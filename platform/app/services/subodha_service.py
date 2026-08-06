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
from typing import Any
from urllib.parse import unquote

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.models import BlobContext, QuizContent
from app.aggregators.subodha_adapter import SubodhaAdapter
from app.aggregators.sync_job_models import SyncItemResult
from app.platform.auth.dependencies import get_db
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.providers.subodha_client import SubodhaClient
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_aggregator_sync_job_repository import ContentAggregatorSyncJobRepository
from app.serializers.subodha_serializer import LegacyCourseDoc, to_course_doc
from app.services.content_aggregator_sync_jobs import record_item_result, set_total

logger = logging.getLogger(__name__)

_ASSET_URL_RE = re.compile(r'/asset-v1:[^"\'\s)>,;&]+')


def _asset_filename(asset_url: str) -> str:
    m = re.search(r"block@(.+)$", asset_url)
    return unquote(m.group(1)) if m else PurePosixPath(asset_url).name


def _blob_exists(blob_service_provider: BlobStorageProvider, container: str, blob_name: str) -> bool:
    try:
        return blob_service_provider.get_container_client(container).get_blob_client(blob_name).exists()
    except Exception:  # noqa: BLE001
        return False


async def fetch_and_store_assets(
    client: SubodhaClient, course_id: str, blocks_response: dict[str, Any], session_cookie: str
) -> dict[str, str]:
    all_blocks = (blocks_response.get("blocks") or {}).values()
    asset_urls = sorted({m for b in all_blocks for m in _ASSET_URL_RE.findall(b.get("student_view_html") or "")})
    if not asset_urls:
        return {}

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
                if _blob_exists(blob_provider, container, blob_name):
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
        updated = QuizContent(raw_html_url=existing.content.raw_html_url, question=question, choices=choices)
        return await self._repo.update_item_content(tenant_id, self.SOURCE_TYPE, block_id, updated)

    async def get_course_diff(self, tenant_id: str, client: SubodhaClient) -> dict[str, Any]:
        live_courses, stored_ids = await asyncio.gather(
            client.list_all_courses(), self._repo.stored_root_ids(tenant_id, self.SOURCE_TYPE)
        )
        live_ids = {c["id"] for c in live_courses}
        new_courses = [c for c in live_courses if c["id"] not in stored_ids]
        removed_ids = [i for i in stored_ids if i not in live_ids]
        return {
            "totalLive": len(live_courses),
            "totalStored": len(stored_ids),
            "newCount": len(new_courses),
            "removedCount": len(removed_ids),
            "newCourseIds": [c["id"] for c in new_courses],
            "removedCourseIds": removed_ids,
            "liveCourses": live_courses,
        }

    async def get_content_list(self, tenant_id: str) -> list[dict[str, Any]]:
        roots = await self._repo.list_roots(tenant_id, self.SOURCE_TYPE)
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
        self, tenant_id: str, client: SubodhaClient, course: dict[str, Any], session_cookie: str, run_id: str, dry_run: bool
    ) -> dict[str, Any]:
        course_id = course["id"]
        try:
            blocks_response = await client.fetch_blocks(course_id, session_cookie)

            if self._adapter.is_empty(blocks_response):
                return {"status": "empty", "courseId": course_id}

            await client.enrich_blocks_with_content(blocks_response, session_cookie)
            url_map = {} if dry_run else await fetch_and_store_assets(client, course_id, blocks_response, session_cookie)
            nodes = self._adapter.build_canonical_nodes(course, blocks_response, run_id, url_map)
            content_hash = self._adapter.compute_content_hash(nodes)

            if dry_run:
                return {"status": "skipped", "courseId": course_id}

            existing_root = await self._repo.get_root(tenant_id, self.SOURCE_TYPE, course_id)
            if existing_root is not None and existing_root.source_metadata.get("content_hash") == content_hash:
                return {"status": "skipped", "courseId": course_id}

            for node in nodes:
                node.tenant_id = tenant_id
            processed = await self._adapter.process_nodes(nodes, self._blob_ctx_factory(course_id), self._blob)
            for node in processed:
                if node.parent_id is None:
                    node.source_metadata["content_hash"] = content_hash
            await self._repo.upsert_tree(tenant_id, self.SOURCE_TYPE, course_id, processed)
            return {"status": "saved", "courseId": course_id}
        except Exception as exc:  # noqa: BLE001
            return {"status": "failed", "courseId": course_id, "error": str(exc)}

    async def run_sync(
        self,
        tenant_id: str,
        client: SubodhaClient,
        job_repo: ContentAggregatorSyncJobRepository,
        job_id: str,
        *,
        course_ids: list[str] | None = None,
        limit: int | None = None,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        started_at = datetime.now(UTC).isoformat()
        logger.info("[subodha] run %s started (dryRun=%s)", job_id, dry_run)

        session_cookie = await client.get_session()
        all_courses = await client.list_all_courses()

        to_process = all_courses
        if course_ids is not None:
            wanted = set(course_ids)
            to_process = [c for c in all_courses if c["id"] in wanted]
        if limit is not None:
            to_process = to_process[:limit]

        logger.info("[subodha] %d of %d courses queued", len(to_process), len(all_courses))
        await set_total(job_repo, tenant_id, job_id, len(to_process))

        semaphore = asyncio.Semaphore(self._settings.subodha_course_concurrency)
        session_box = {"cookie": session_cookie}
        lock = asyncio.Lock()
        processed_count = 0

        async def process_one(course: dict[str, Any]) -> None:
            nonlocal processed_count
            async with semaphore:
                async with lock:
                    if processed_count and processed_count % self._settings.subodha_session_refresh_every == 0:
                        client.clear_session_cache()
                        session_box["cookie"] = await client.get_session()

                result = await self.process_course(tenant_id, client, course, session_box["cookie"], job_id, dry_run)
                entry = SyncItemResult(
                    source_id=result["courseId"], name=course.get("name") or "", status=result["status"],
                    error=result.get("error"), at=datetime.now(UTC).isoformat(),
                )
                await record_item_result(job_repo, tenant_id, job_id, entry)

                async with lock:
                    processed_count += 1

                if self._settings.subodha_course_delay_ms > 0:
                    await asyncio.sleep(self._settings.subodha_course_delay_ms / 1000)

        await asyncio.gather(*(process_one(c) for c in to_process))

        stored = await job_repo.get_job(tenant_id, job_id)
        stats = stored.stats.to_doc() if stored else {}
        permanent_failures = [
            {"courseId": c.source_id, "error": c.error or ""}
            for c in (stored.items if stored else [])
            if c.status == "failed"
        ]
        summary = {
            "runId": job_id,
            "startedAt": started_at,
            "finishedAt": datetime.now(UTC).isoformat(),
            "totalCourses": len(all_courses),
            "processed": stored.processed if stored else processed_count,
            "stats": stats,
            "permanentFailures": permanent_failures,
            "dlqProcessed": 0,
        }
        logger.info("[subodha] done -> %s", stats)
        return summary

    async def run_single_course_sync(
        self,
        tenant_id: str,
        client: SubodhaClient,
        job_repo: ContentAggregatorSyncJobRepository,
        job_id: str,
        course_id: str,
        *,
        dry_run: bool = False,
    ) -> dict[str, Any]:
        started_at = datetime.now(UTC).isoformat()

        session_cookie = await client.get_session()
        all_courses = await client.list_all_courses()
        course = next((c for c in all_courses if c["id"] == course_id), None)
        if course is None:
            raise ValueError(f"Course not found on Subodha: {course_id}")

        await set_total(job_repo, tenant_id, job_id, 1)
        result = await self.process_course(tenant_id, client, course, session_cookie, job_id, dry_run)
        entry = SyncItemResult(
            source_id=result["courseId"], name=course.get("name") or "", status=result["status"],
            error=result.get("error"), at=datetime.now(UTC).isoformat(),
        )
        await record_item_result(job_repo, tenant_id, job_id, entry)

        stored = await job_repo.get_job(tenant_id, job_id)
        stats = stored.stats.to_doc() if stored else {}
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


def get_subodha_service(db: AsyncDatabase = Depends(get_db)) -> SubodhaService:
    return SubodhaService(db)
