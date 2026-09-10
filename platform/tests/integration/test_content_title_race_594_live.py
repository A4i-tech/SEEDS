"""Live-DB reproduction test for issue #594 - content title edits do not reliably propagate.

Root cause: `_process_audio_content_job` snapshots the content document via `find_raw_by_id`
at job start, then could write that snapshot's title/theme back to the DB at job completion.
If a user edits the title/theme while the audio job is running, the job's completion could
overwrite the newer value with the stale one captured at job start.

Unlike `test_content_title_race_594.py` (which runs against `AsyncMongoMockClient`), this test
runs against a real local MongoDB instance to verify the fix holds with actual DB read/write
semantics, not just the in-memory mock. Blob storage and TTS remain mocked because ffmpeg and
Azure credentials are not available in this environment (external-service infra still
unavailable locally - same limitation the PR disclosed).
"""
from __future__ import annotations

import os
import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32chars!!")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")

import pymongo
import pytest
import pytest_asyncio
from bson import ObjectId
from pymongo import AsyncMongoClient

MONGO_URI = "mongodb://localhost:27017"
try:
    pymongo.MongoClient(MONGO_URI, serverSelectionTimeoutMS=1000).server_info()
    _MONGO_AVAILABLE = True
except Exception:
    _MONGO_AVAILABLE = False

pytestmark = pytest.mark.skipif(
    not _MONGO_AVAILABLE, reason="Requires a local MongoDB instance on mongodb://localhost:27017"
)

_TENANT_A_ID = str(ObjectId())


@pytest_asyncio.fixture
async def live_db():
    client = AsyncMongoClient(MONGO_URI)
    db_name = f"seeds_594_live_{uuid.uuid4().hex}"
    db = client[db_name]
    yield db
    await client.drop_database(db_name)
    await client.close()


@pytest.mark.asyncio
async def test_stale_content_snapshot_overwrites_concurrent_title_edit(live_db):
    from app.consumers.content_job_consumer import _process_audio_content_job
    from app.repositories.content_job_repository import ContentJobRepository
    from app.repositories.content_repository import ContentRepository

    content_id = str(ObjectId())
    await live_db["contentsV3"].insert_one(
        {
            "_id": ObjectId(content_id),
            "tenant_id": ObjectId(_TENANT_A_ID),
            "type": "Story",
            "language": "english",
            "title": {"english": "Old Title"},
            "theme": {"english": "Animals"},
            "audio_content": [
                {"audio_url": "https://myaccount.blob.core.windows.net/input-container/test.mp3"}
            ],
            "is_pull_model": False,
            "is_deleted": False,
        }
    )
    job_id = str(uuid.uuid4())
    await live_db["content_jobs"].insert_one(
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

    content_repo = ContentRepository(live_db)
    job_repo = ContentJobRepository(live_db)

    async def _concurrently_edit_title(inp, out, **kwargs):
        # Simulate a user PATCHing the title WHILE this job is still running
        await live_db["contentsV3"].update_one(
            {"_id": ObjectId(content_id)},
            {"$set": {"title": {"english": "New Title From Concurrent Edit"}}},
        )
        with open(out, "wb") as fh:
            fh.write(b"fake_wav_data")

    with patch(
        "app.consumers.content_job_consumer._transcode_to_wav",
        new=AsyncMock(side_effect=_concurrently_edit_title),
    ):
        job_doc = {"_id": job_id, "content_id": content_id}
        await _process_audio_content_job(job_doc, job_repo, content_repo, mock_blob)

    final_doc = await live_db["contentsV3"].find_one({"_id": ObjectId(content_id)})
    assert final_doc["title"]["english"] == "New Title From Concurrent Edit", (
        "Root cause reproduced on live DB: job completion overwrote the concurrently edited "
        f"title with its stale job-start snapshot. Got: {final_doc['title']}"
    )
