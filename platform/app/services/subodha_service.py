"""
Subodha sync service — mappers, asset upload, and course-sync orchestration.

Ported from subodha/backend/src/{mappers,assets,run,jobs,diff,contentList}.ts.
"""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import mimetypes
import re
from datetime import UTC, datetime
from pathlib import PurePosixPath
from typing import Any
from urllib.parse import unquote

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.dependencies import get_db
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.providers.subodha_client import SubodhaClient
from app.repositories.subodha_job_repository import SubodhaJobRepository
from app.repositories.subodha_repository import SubodhaRepository
from app.services.subodha_jobs import record_course_result, set_total

logger = logging.getLogger(__name__)

_CONTENT_TYPES_FOR_MAPPING = {"html", "video", "problem", "drag-and-drop-v2", "lti", "discussion"}
_ASSET_URL_RE = re.compile(r'/asset-v1:[^"\'\s)>,;&]+')
_REQUEST_TOKEN_RE = re.compile(r'\sdata-request-token="[^"]*"')

# ---------------------------------------------------------------------------
# Pure mappers
# ---------------------------------------------------------------------------


def is_empty(blocks_response: dict[str, Any] | None) -> bool:
    if not blocks_response or not blocks_response.get("blocks"):
        return True
    return not any(b.get("type") in _CONTENT_TYPES_FOR_MAPPING for b in blocks_response["blocks"].values())


def _rewrite_urls(html: str, url_map: dict[str, str]) -> str:
    if not html or not url_map:
        return html
    for original, blob_url in url_map.items():
        html = html.replace(original, blob_url)
    return html


def _strip_volatile(html: str) -> str:
    return _REQUEST_TOKEN_RE.sub("", html) if html else html


def normalize_blocks(blocks_response: dict[str, Any] | None, url_map: dict[str, str] | None = None) -> list[dict[str, Any]]:
    url_map = url_map or {}
    if not blocks_response or not blocks_response.get("blocks"):
        return []
    return [
        {
            "blockId": b["id"],
            "type": b["type"],
            "displayName": b.get("display_name") or "",
            "html": _rewrite_urls(_strip_volatile(b.get("student_view_html") or ""), url_map),
            "studentViewData": b.get("student_view_data"),
            "lmsUrl": b.get("lms_web_url") or "",
        }
        for b in blocks_response["blocks"].values()
        if b.get("type") in _CONTENT_TYPES_FOR_MAPPING
    ]


def _hash_blocks(blocks: list[dict[str, Any]]) -> str:
    return hashlib.sha256(json.dumps(blocks).encode()).hexdigest()


def build_outline(blocks_response: dict[str, Any] | None) -> list[dict[str, Any]]:
    """Build the chapter -> sequential -> vertical outline tree.

    Mirrors the real course navigator (chapters containing lessons containing
    units). Units reference leaf content by blockId — actual block content
    lives in the flat `blocks` array from normalize_blocks, looked up by id.
    """
    if not blocks_response or not blocks_response.get("blocks"):
        return []
    blocks = blocks_response["blocks"]
    root = blocks_response.get("root")
    course_block = blocks.get(root, {})

    def children_of_type(block: dict[str, Any], child_type: str) -> list[str]:
        return [c for c in block.get("children", []) if blocks.get(c, {}).get("type") == child_type]

    def vertical_outline(vertical_id: str) -> dict[str, Any]:
        vertical = blocks.get(vertical_id, {})
        leaf_ids = [c for c in vertical.get("children", []) if blocks.get(c, {}).get("type") in _CONTENT_TYPES_FOR_MAPPING]
        return {"blockId": vertical_id, "displayName": vertical.get("display_name") or "", "blockIds": leaf_ids}

    def sequential_outline(sequential_id: str) -> dict[str, Any]:
        sequential = blocks.get(sequential_id, {})
        verticals = [vertical_outline(v) for v in children_of_type(sequential, "vertical")]
        return {"blockId": sequential_id, "displayName": sequential.get("display_name") or "", "verticals": verticals}

    def chapter_outline(chapter_id: str) -> dict[str, Any]:
        chapter = blocks.get(chapter_id, {})
        sequentials = [sequential_outline(s) for s in children_of_type(chapter, "sequential")]
        return {"blockId": chapter_id, "displayName": chapter.get("display_name") or "", "sequentials": sequentials}

    return [chapter_outline(c) for c in children_of_type(course_block, "chapter")]


def _parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def map_course(
    course: dict[str, Any],
    blocks_response: dict[str, Any] | None,
    run_id: str,
    url_map: dict[str, str] | None = None,
) -> dict[str, Any]:
    blocks = normalize_blocks(blocks_response, url_map)
    return {
        "sourceId": course["id"],
        "source": "subodha",
        "contentHash": _hash_blocks(blocks),
        "title": course["name"],
        "org": course["org"],
        "courseNumber": course["number"],
        "description": course.get("short_description"),
        "language": course.get("language"),
        "start": _parse_iso(course["start"]),
        "pacing": course["pacing"],
        "hidden": course["hidden"],
        "invitationOnly": course["invitation_only"],
        "mobileAvailable": course["mobile_available"],
        "blocks": blocks,
        "outline": build_outline(blocks_response),
        "assets": url_map or {},
        "lastRunId": run_id,
        "fetchedAt": datetime.now(UTC),
    }


# ---------------------------------------------------------------------------
# Asset fetch + blob upload
# ---------------------------------------------------------------------------


def _asset_filename(asset_url: str) -> str:
    m = re.search(r"block@(.+)$", asset_url)
    return unquote(m.group(1)) if m else PurePosixPath(asset_url).name


def _blob_exists(blob_service_provider: BlobStorageProvider, container: str, blob_name: str) -> bool:
    try:
        return blob_service_provider.get_container_client(container).get_blob_client(blob_name).exists()
    except Exception:  # noqa: BLE001
        return False


async def fetch_and_store_assets(
    client: SubodhaClient,
    course_id: str,
    blocks_response: dict[str, Any],
    session_cookie: str,
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


# ---------------------------------------------------------------------------
# Sync orchestration
# ---------------------------------------------------------------------------


class SubodhaService:
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._repo = SubodhaRepository(db)
        self._settings = get_settings()

    async def update_problem_block(
        self,
        tenant_id: str,
        course_id: str,
        block_id: str,
        question: str,
        choices: list[dict[str, str]],
    ) -> int:
        return await self._repo.update_block(tenant_id, course_id, block_id, {"question": question, "choices": choices})

    async def get_course_diff(self, tenant_id: str, client: SubodhaClient) -> dict[str, Any]:
        live_courses, stored_ids = await asyncio.gather(client.list_all_courses(), self._repo.stored_source_ids(tenant_id))
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
        docs = await self._repo.list_content(tenant_id)
        return [
            {
                "id": d["sourceId"],
                "name": d.get("title"),
                "org": d.get("org"),
                "number": d.get("courseNumber"),
                "language": d.get("language"),
                "hidden": d.get("hidden"),
                "synced": True,
                "lastSyncedAt": d.get("fetchedAt"),
                "lastRunId": d.get("lastRunId"),
            }
            for d in docs
        ]

    async def get_course(self, tenant_id: str, source_id: str) -> dict[str, Any] | None:
        return await self._repo.load_course(tenant_id, source_id)

    async def delete_course(self, tenant_id: str, source_id: str) -> int:
        return await self._repo.delete_course(tenant_id, source_id)

    async def process_course(
        self,
        tenant_id: str,
        client: SubodhaClient,
        course: dict[str, Any],
        session_cookie: str,
        run_id: str,
        dry_run: bool,
    ) -> dict[str, Any]:
        course_id = course["id"]
        try:
            blocks_response = await client.fetch_blocks(course_id, session_cookie)

            if is_empty(blocks_response):
                return {"status": "empty", "courseId": course_id}

            await client.enrich_blocks_with_content(blocks_response, session_cookie)
            url_map = {} if dry_run else await fetch_and_store_assets(client, course_id, blocks_response, session_cookie)
            mapped = map_course(course, blocks_response, run_id, url_map)

            if dry_run:
                return {"status": "skipped", "courseId": course_id}

            existing = await self._repo.load_course(tenant_id, course_id)
            if existing and existing.get("contentHash") == mapped["contentHash"]:
                return {"status": "skipped", "courseId": course_id}

            await self._repo.save_course(tenant_id, course_id, mapped)
            return {"status": "saved", "courseId": course_id}
        except Exception as exc:  # noqa: BLE001
            return {"status": "failed", "courseId": course_id, "error": str(exc)}

    async def run_sync(
        self,
        tenant_id: str,
        client: SubodhaClient,
        job_repo: SubodhaJobRepository,
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
                entry = {
                    "courseId": result["courseId"],
                    "name": course.get("name") or "",
                    "status": result["status"],
                    "error": result.get("error"),
                    "at": datetime.now(UTC).isoformat(),
                }
                await record_course_result(job_repo, tenant_id, job_id, entry)

                async with lock:
                    processed_count += 1

                if self._settings.subodha_course_delay_ms > 0:
                    await asyncio.sleep(self._settings.subodha_course_delay_ms / 1000)

        await asyncio.gather(*(process_one(c) for c in to_process))

        doc = await job_repo.get_job(tenant_id, job_id)
        stats = doc["stats"] if doc else {}
        permanent_failures = [
            {"courseId": c["courseId"], "error": c.get("error") or ""}
            for c in (doc["courses"] if doc else [])
            if c["status"] == "failed"
        ]
        summary = {
            "runId": job_id,
            "startedAt": started_at,
            "finishedAt": datetime.now(UTC).isoformat(),
            "totalCourses": len(all_courses),
            "processed": doc["processed"] if doc else processed_count,
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
        job_repo: SubodhaJobRepository,
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
        entry = {
            "courseId": result["courseId"],
            "name": course.get("name") or "",
            "status": result["status"],
            "error": result.get("error"),
            "at": datetime.now(UTC).isoformat(),
        }
        await record_course_result(job_repo, tenant_id, job_id, entry)

        doc = await job_repo.get_job(tenant_id, job_id)
        stats = doc["stats"] if doc else {}
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


def get_subodha_service(db: AsyncIOMotorDatabase = Depends(get_db)) -> SubodhaService:
    return SubodhaService(db)
