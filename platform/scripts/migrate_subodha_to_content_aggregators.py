"""One-off migration: subodhaCourses/subodhaSyncJobs -> contentAggregators/contentAggregatorSyncJobs.

Dry run by default:
    python -m scripts.migrate_subodha_to_content_aggregators
Apply for real:
    python -m scripts.migrate_subodha_to_content_aggregators --apply
"""
from __future__ import annotations

import argparse
import asyncio
import logging
import time
from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.content_strategies import STRATEGY_REGISTRY
from app.aggregators.models import BlobContext, CanonicalNode, ItemType, NodeKind
from app.aggregators.sync_job_models import SyncItemResult, SyncJob, SyncStats
from app.platform.database import get_database, init_database
from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider
from app.repositories.content_aggregator_repository import ContentAggregatorRepository

logger = logging.getLogger(__name__)

_LEGACY_TYPE_TO_ITEM_TYPE: dict[str, ItemType] = {
    "html": ItemType.TEXT, "video": ItemType.VIDEO, "problem": ItemType.QUIZ, "discussion": ItemType.DISCUSSION,
}


def _safe(value: str) -> str:
    return value.replace(":", "_").replace("/", "_").replace("+", "_").replace("@", "_")


def _outline_container_nodes(
    outline: list[dict[str, Any]], tenant_id: str, root_id: str, run_id: str, now: str
) -> tuple[list[CanonicalNode], dict[str, str], dict[str, int]]:
    nodes: list[CanonicalNode] = []
    item_parent: dict[str, str] = {}
    item_order: dict[str, int] = {}

    for c_order, chapter in enumerate(outline):
        nodes.append(CanonicalNode(
            tenant_id=tenant_id, source_type="subodha", source_id=chapter["blockId"], root_id=root_id,
            parent_id=root_id, order=c_order, node_kind=NodeKind.CONTAINER, item_type=None,
            display_name=chapter["displayName"], content=None, lms_url=None, native_type="chapter",
            source_metadata={}, last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
        ))
        for s_order, seq in enumerate(chapter.get("sequentials", [])):
            nodes.append(CanonicalNode(
                tenant_id=tenant_id, source_type="subodha", source_id=seq["blockId"], root_id=root_id,
                parent_id=chapter["blockId"], order=s_order, node_kind=NodeKind.CONTAINER, item_type=None,
                display_name=seq["displayName"], content=None, lms_url=None, native_type="sequential",
                source_metadata={}, last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
            ))
            for v_order, vert in enumerate(seq.get("verticals", [])):
                nodes.append(CanonicalNode(
                    tenant_id=tenant_id, source_type="subodha", source_id=vert["blockId"], root_id=root_id,
                    parent_id=seq["blockId"], order=v_order, node_kind=NodeKind.CONTAINER, item_type=None,
                    display_name=vert["displayName"], content=None, lms_url=None, native_type="vertical",
                    source_metadata={}, last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
                ))
                for b_order, block_id in enumerate(vert.get("blockIds", [])):
                    item_parent[block_id] = vert["blockId"]
                    item_order[block_id] = b_order

    return nodes, item_parent, item_order


async def _migrate_one_course(
    db: AsyncDatabase, repo: ContentAggregatorRepository, blob: BlobStorageProvider, container: str,
    course_id: object, already_migrated: set[str], *, dry_run: bool,
) -> str:
    """Returns "migrated" or "failed" for one course."""
    course = await db["subodhaCourses"].find_one({"_id": course_id})
    if course is None:
        return "migrated"
    if course["sourceId"] in already_migrated and not dry_run:
        return "migrated"
    try:
        tenant_id = course["tenantId"]
        root_id = course["sourceId"]
        run_id = course.get("lastRunId") or "migration"
        now = datetime.now(UTC).isoformat()

        container_nodes, item_parent, item_order = _outline_container_nodes(course.get("outline", []), tenant_id, root_id, run_id, now)

        course_node = CanonicalNode(
            tenant_id=tenant_id, source_type="subodha", source_id=root_id, root_id=root_id, parent_id=None,
            order=0, node_kind=NodeKind.CONTAINER, item_type=None, display_name=course.get("title", ""),
            content=None, lms_url=None, native_type="course",
            source_metadata={
                "org": course.get("org"), "course_number": course.get("courseNumber"),
                "description": course.get("description"), "language": course.get("language"),
                "start": course.get("start"), "pacing": course.get("pacing"), "hidden": course.get("hidden"),
                "invitation_only": course.get("invitationOnly"), "mobile_available": course.get("mobileAvailable"),
                "content_hash": course.get("contentHash"),
            },
            last_run_id=run_id, fetched_at=course.get("fetchedAt", now), created_at=now, updated_at=now,
        )

        item_nodes: list[CanonicalNode] = []
        safe_course_id = _safe(root_id)
        for block in course.get("blocks", []):
            native_type = block["type"]
            item_type = _LEGACY_TYPE_TO_ITEM_TYPE.get(native_type, ItemType.OTHER)
            ctx = BlobContext(container=container, blob_prefix=f"courses/{safe_course_id}/items/{_safe(block['blockId'])}")
            strategy = STRATEGY_REGISTRY[item_type]
            raw = block.get("studentViewData") if item_type == ItemType.VIDEO else block.get("html", "")
            content = None if dry_run else await strategy.process(raw, ctx, blob)
            block_id = block["blockId"]
            if block_id not in item_parent:
                logger.warning(
                    "[migration] course %s: block %s has no vertical parent in the outline — "
                    "attaching to course root, which the outline-based UI never traverses (unreachable there)",
                    root_id, block_id,
                )
            item_nodes.append(CanonicalNode(
                tenant_id=tenant_id, source_type="subodha", source_id=block_id, root_id=root_id,
                parent_id=item_parent.get(block_id, root_id), order=item_order.get(block_id, 0), node_kind=NodeKind.ITEM,
                item_type=item_type, display_name=block.get("displayName", ""), content=content,
                lms_url=block.get("lmsUrl"), native_type=native_type, source_metadata={},
                last_run_id=run_id, fetched_at=now, created_at=now, updated_at=now,
            ))

        if not dry_run:
            await repo.upsert_tree(tenant_id, "subodha", root_id, [course_node, *container_nodes, *item_nodes])
        return "migrated"
    except Exception as exc:  # noqa: BLE001
        logger.error("[migration] failed course %s: %s", course.get("sourceId"), exc)
        return "failed"


async def migrate_courses(db: AsyncDatabase, *, dry_run: bool, blob: BlobStorageProvider | None = None) -> dict[str, int]:
    repo = ContentAggregatorRepository(db)
    blob = blob if blob is not None else BlobStorageProvider()
    container = "subodha"

    already_migrated = {
        d["source_id"]
        async for d in db["contentAggregators"].find({"source_type": "subodha", "parent_id": None}, {"source_id": 1})
    }
    course_ids = [d["_id"] async for d in db["subodhaCourses"].find({}, {"_id": 1})]

    semaphore = asyncio.Semaphore(get_settings().subodha_course_concurrency)
    total = len(course_ids)
    done_count = 0
    progress_lock = asyncio.Lock()

    async def run_one(course_id: object) -> str:
        nonlocal done_count
        async with semaphore:
            started = time.monotonic()
            result = await _migrate_one_course(db, repo, blob, container, course_id, already_migrated, dry_run=dry_run)
            elapsed = time.monotonic() - started
        async with progress_lock:
            done_count += 1
            print(f"[migration] {done_count}/{total} {result} ({elapsed:.1f}s) course_id={course_id}", flush=True)
        return result

    results = await asyncio.gather(*(run_one(cid) for cid in course_ids))
    return {"migrated": results.count("migrated"), "failed": results.count("failed")}


async def migrate_jobs(db: AsyncDatabase, *, dry_run: bool) -> dict[str, int]:
    col = db["contentAggregatorSyncJobs"]
    counts = {"migrated": 0, "failed": 0}

    async for job in db["subodhaSyncJobs"].find({}):
        try:
            new_job = SyncJob(
                job_id=job["_id"], tenant_id=job["tenantId"], source_type="subodha", scope=job["scope"],
                source_id=job.get("courseId"), status=job["status"], started_at=job.get("startedAt"),
                finished_at=job.get("finishedAt"), total_items=job.get("totalCourses", 0),
                processed=job.get("processed", 0), stats=SyncStats.from_doc(job.get("stats", {})),
                items=[
                    SyncItemResult(source_id=c["courseId"], name=c.get("name", ""), status=c["status"], error=c.get("error"), at=c.get("at"))
                    for c in job.get("courses", [])
                ],
                error=job.get("error"),
            )
            if not dry_run:
                await col.insert_one(new_job.to_doc())
            counts["migrated"] += 1
        except Exception as exc:  # noqa: BLE001
            logger.error("[migration] failed job %s: %s", job.get("_id"), exc)
            counts["failed"] += 1

    return counts


async def _main(apply: bool) -> None:
    await init_database()
    db = get_database()
    course_counts = await migrate_courses(db, dry_run=not apply)
    job_counts = await migrate_jobs(db, dry_run=not apply)
    logger.info("[migration] courses: %s", course_counts)
    logger.info("[migration] jobs: %s", job_counts)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="Actually write. Omit for a dry run (counts only).")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO)
    asyncio.run(_main(args.apply))
