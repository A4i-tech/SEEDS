"""
Reproduction test for issue #594 - content title edits do not reliably propagate.

Root cause: `_process_audio_content_job` snapshots the content document via
`find_raw_by_id` at job start, then unconditionally writes that snapshot's
`title`/`theme` back to the DB in `save_processed()` at job completion. If the
job is running (audio upload + title edit), or a title-only edit shortly after
it, the job's completion overwrites the newer title with the stale value
captured at job start.
"""

from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")
os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "")
os.environ.setdefault("DB_CONNECTION", "")

import pytest
import pytest_asyncio
from bson import ObjectId

from tests.support.mongomock_async import AsyncMongoMockClient

_TENANT_A_ID = str(ObjectId())


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test"]
    yield db
    await client.close()


@pytest.mark.asyncio
async def test_stale_content_snapshot_overwrites_concurrent_title_edit(mock_db):
    """A title edit made WHILE an audio job is running is clobbered when the
    job's completion saves its stale job-start snapshot."""
    from app.consumers.content_job_consumer import _process_audio_content_job
    from app.repositories.content_job_repository import ContentJobRepository
    from app.repositories.content_repository import ContentRepository

    content_id = str(ObjectId())
    job_id = str(uuid.uuid4())

    await mock_db["contentsV3"].insert_one(
        {
            "_id": ObjectId(content_id),
            "tenant_id": ObjectId(_TENANT_A_ID),
            "type": "Story",
            "language": "english",
            "title": {"english": "Old Title"},
            "theme": {"english": "Animals"},
            "audio_content": [{"audio_url": "https://myaccount.blob.core.windows.net/input-container/test.mp3"}],
            "is_pull_model": False,
            "is_deleted": False,
        }
    )
    await mock_db["content_jobs"].insert_one(
        {
            "_id": job_id,
            "content_id": content_id,
            "job_type": "update",
            "status": "pending",
            "created_at": datetime.now(UTC),
        }
    )

    mock_blob = MagicMock()
    mock_blob.download_from_url = AsyncMock(return_value=b"fake_audio_data_12345")
    mock_blob.upload_file = AsyncMock(
        return_value="https://myaccount.blob.core.windows.net/output-container/test.wav"
    )
    mock_blob.get_container_client = MagicMock()

    content_repo = ContentRepository(mock_db)
    job_repo = ContentJobRepository(mock_db)

    async def _transcode_and_concurrently_edit_title(inp, out, **kwargs):
        # Simulate a user PATCHing the title WHILE this job is still running.
        await mock_db["contentsV3"].update_one(
            {"_id": ObjectId(content_id)},
            {"$set": {"title": {"english": "New Title From Concurrent Edit"}}},
        )
        with open(out, "wb") as fh:
            fh.write(b"fake_wav_data")

    with __import__("unittest.mock", fromlist=["patch"]).patch(
        "app.consumers.content_job_consumer._transcode_to_wav",
        new=AsyncMock(side_effect=_transcode_and_concurrently_edit_title),
    ):
        job_doc = await mock_db["content_jobs"].find_one({"_id": job_id})
        await _process_audio_content_job(job_doc, job_repo, content_repo, mock_blob)

    final_doc = await mock_db["contentsV3"].find_one({"_id": ObjectId(content_id)})
    assert final_doc["title"]["english"] == "New Title From Concurrent Edit", (
        f"Root cause reproduced: job completion overwrote the concurrently-edited "
        f"title with its stale job-start snapshot. Got: {final_doc['title']}"
    )
