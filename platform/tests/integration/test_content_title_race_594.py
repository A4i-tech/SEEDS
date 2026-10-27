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
from unittest.mock import AsyncMock, MagicMock, patch

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


async def _seed(mock_db, *, is_pull_model, title, theme, audio_content):
    """Insert a content doc + pending job and return the repos/ids tests need.

    Only the setup genuinely shared by both tests below lives here — each
    test's concurrent-edit hook, patching, and assertions stay explicit.
    """
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
            "title": title,
            "theme": theme,
            "audio_content": audio_content,
            "is_pull_model": is_pull_model,
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

    content_repo = ContentRepository(mock_db)
    job_repo = ContentJobRepository(mock_db)
    return content_id, job_id, content_repo, job_repo


@pytest.mark.asyncio
async def test_stale_content_snapshot_overwrites_concurrent_title_edit(mock_db):
    """A title edit made WHILE an audio job is running is clobbered when the
    job's completion saves its stale job-start snapshot."""
    from app.consumers.content_job_consumer import _process_audio_content_job

    content_id, job_id, content_repo, job_repo = await _seed(
        mock_db,
        is_pull_model=False,
        title={"english": "Old Title"},
        theme={"english": "Animals"},
        audio_content=[{"audio_url": "https://myaccount.blob.core.windows.net/input-container/test.mp3"}],
    )

    mock_blob = MagicMock()
    mock_blob.download_from_url = AsyncMock(return_value=b"fake_audio_data_12345")
    mock_blob.upload_file = AsyncMock(
        return_value="https://myaccount.blob.core.windows.net/output-container/test.wav"
    )
    mock_blob.get_container_client = MagicMock()

    async def _transcode_and_concurrently_edit_title(inp, out, **kwargs):
        # Simulate a user PATCHing the title WHILE this job is still running.
        await mock_db["contentsV3"].update_one(
            {"_id": ObjectId(content_id)},
            {"$set": {"title": {"english": "New Title From Concurrent Edit"}}},
        )
        with open(out, "wb") as fh:
            fh.write(b"fake_wav_data")

    with patch(
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


@pytest.mark.asyncio
async def test_pull_model_tts_updates_audio_url_without_clobbering_concurrent_edit(mock_db):
    """Pull-model jobs must still persist the freshly-generated title/theme
    audio_url, but must not clobber a concurrent title/theme text edit with
    the stale job-start snapshot text."""
    from app.consumers.content_job_consumer import _process_audio_content_job

    content_id, job_id, content_repo, job_repo = await _seed(
        mock_db,
        is_pull_model=True,
        title={"english": "Old Title", "local": "Old Title"},
        theme={"english": "Animals", "local": "Animals"},
        audio_content=[],
    )

    mock_blob = MagicMock()
    mock_blob.get_container_client = MagicMock(side_effect=Exception("no theme audio yet"))

    async def _concurrently_edit_title_and_theme(*args, **kwargs):
        await mock_db["contentsV3"].update_one(
            {"_id": ObjectId(content_id)},
            {
                "$set": {
                    "title": {"english": "New Title From Concurrent Edit", "local": "New Title"},
                    "theme": {"english": "Space", "local": "Space"},
                }
            },
        )
        return b"fake_tts_audio"

    with (
        patch(
            "app.services.tts_service.synthesize",
            new=AsyncMock(side_effect=_concurrently_edit_title_and_theme),
        ),
        patch(
            "app.services.tts_service.add_for_in_option_audio",
            side_effect=lambda language, text: text,
        ),
    ):
        async def _upload_file(container, blob_name, *args, **kwargs):
            return f"https://myaccount.blob.core.windows.net/{container}/{blob_name}"

        mock_blob.upload_file = AsyncMock(side_effect=_upload_file)
        job_doc = await mock_db["content_jobs"].find_one({"_id": job_id})
        await _process_audio_content_job(job_doc, job_repo, content_repo, mock_blob)

    final_doc = await mock_db["contentsV3"].find_one({"_id": ObjectId(content_id)})
    assert final_doc["title"]["english"] == "New Title From Concurrent Edit", (
        f"TTS completion clobbered the concurrently-edited title text. Got: {final_doc['title']}"
    )
    assert final_doc["theme"]["english"] == "Space", (
        f"TTS completion clobbered the concurrently-edited theme text. Got: {final_doc['theme']}"
    )
    assert final_doc["title"]["audio_url"] == f"https://myaccount.blob.core.windows.net/experience-titles/{content_id}/1.0.mp3"
    assert final_doc["theme"]["audio_url"] == "https://myaccount.blob.core.windows.net/theme-titles/Animals/1.0.mp3"
    assert final_doc["title"]["audio_url"] != final_doc["theme"]["audio_url"]


@pytest.mark.asyncio
async def test_existing_theme_audio_is_reused_without_resynthesizing():
    """When theme audio already exists in blob storage, `_process_tts_for_content`
    must reuse the existing blob's URL and must not call `tts_service.synthesize`
    or `upload_file` for the theme."""
    from app.consumers.content_job_consumer import _process_tts_for_content

    content_doc = {
        "_id": "content-reuse-1",
        "language": "english",
        "title": {},
        "theme": {"english": "Animals", "local": "Animals"},
    }

    existing_blob_url = "https://myaccount.blob.core.windows.net/theme-titles/Animals/1.0.mp3"
    blob_client = MagicMock()
    blob_client.get_blob_properties = AsyncMock(return_value={})
    blob_client.url = existing_blob_url
    container_client = MagicMock()
    container_client.get_blob_client = MagicMock(return_value=blob_client)

    mock_blob_provider = MagicMock()
    mock_blob_provider.get_container_client = MagicMock(return_value=container_client)
    mock_blob_provider.upload_file = AsyncMock()

    with patch("app.services.tts_service.synthesize", new=AsyncMock()) as mock_synthesize:
        await _process_tts_for_content(content_doc, mock_blob_provider)

    assert content_doc["theme"]["audio_url"] == existing_blob_url
    mock_synthesize.assert_not_called()
    mock_blob_provider.upload_file.assert_not_called()
