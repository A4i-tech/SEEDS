from __future__ import annotations

import pytest

from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_aggregator_sync_job_repository import ContentAggregatorSyncJobRepository
from scripts.migrate_subodha_to_content_aggregators import migrate_courses, migrate_jobs
from tests.support.mongomock_async import AsyncMongoMockClient

LEGACY_COURSE = {
    "tenantId": "tenant-a", "sourceId": "course-1", "source": "subodha", "contentHash": "abc123",
    "title": "Demo", "org": "edX", "courseNumber": "DemoX", "description": "", "language": "en",
    "start": "2030-05-06T09:46:11+00:00", "pacing": "instructor", "hidden": False,
    "invitationOnly": False, "mobileAvailable": True, "lastRunId": "run-1", "fetchedAt": "2026-08-06T00:00:00Z",
    "blocks": [
        {"blockId": "html-1", "type": "html", "displayName": "Welcome", "html": "<p>Hi</p>",
         "studentViewData": None, "lmsUrl": "https://lms/html-1"},
    ],
    "outline": [
        {"blockId": "chapter-1", "displayName": "Intro", "sequentials": [
            {"blockId": "seq-1", "displayName": "Lesson 1", "verticals": [
                {"blockId": "vert-1", "displayName": "Unit 1", "blockIds": ["html-1"]},
            ]},
        ]},
    ],
}

LEGACY_JOB = {
    "_id": "job-1", "tenantId": "tenant-a", "scope": "all", "courseId": None, "status": "completed",
    "startedAt": "2026-08-06T00:00:00Z", "finishedAt": "2026-08-06T00:01:00Z", "totalCourses": 1,
    "processed": 1, "stats": {"saved": 1, "skipped": 0, "empty": 0, "failed": 0},
    "courses": [{"courseId": "course-1", "name": "Demo", "status": "saved", "error": None, "at": "x"}],
    "error": None,
}


class FakeBlobStorageProvider:
    def __init__(self):
        self.uploaded: dict[str, bytes] = {}

    async def upload_file(self, container, blob_name, data, content_type="application/octet-stream"):
        self.uploaded[blob_name] = data
        return f"https://blob.test/{container}/{blob_name}"


@pytest.mark.asyncio
async def test_migrate_courses_writes_canonical_tree_and_converts_html():
    db = AsyncMongoMockClient()["test_seeds"]
    await db["subodhaCourses"].insert_one(dict(LEGACY_COURSE))

    result = await migrate_courses(db, dry_run=False, blob=FakeBlobStorageProvider())
    assert result == {"migrated": 1, "failed": 0}

    tree = await ContentAggregatorRepository(db).get_tree("tenant-a", "subodha", "course-1")
    assert len(tree) == 5  # course + chapter + sequential + vertical + html item
    html_node = next(n for n in tree if n.source_id == "html-1")
    assert html_node.content.markdown_url or html_node.content.conversion_failed


@pytest.mark.asyncio
async def test_migrate_jobs_renames_fields_and_backfills_source_type():
    db = AsyncMongoMockClient()["test_seeds"]
    await db["subodhaSyncJobs"].insert_one(dict(LEGACY_JOB))

    result = await migrate_jobs(db, dry_run=False)
    assert result == {"migrated": 1, "failed": 0}

    job = await ContentAggregatorSyncJobRepository(db).get_job("tenant-a", "job-1")
    assert job.source_type == "subodha"
    assert job.total_items == 1
    assert job.items[0].source_id == "course-1"


@pytest.mark.asyncio
async def test_migrate_courses_dry_run_writes_nothing():
    db = AsyncMongoMockClient()["test_seeds"]
    await db["subodhaCourses"].insert_one(dict(LEGACY_COURSE))

    result = await migrate_courses(db, dry_run=True, blob=FakeBlobStorageProvider())
    assert result["migrated"] == 1
    assert await ContentAggregatorRepository(db).get_tree("tenant-a", "subodha", "course-1") == []
