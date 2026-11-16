from __future__ import annotations

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

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
async def test_job_completion_does_not_overwrite_concurrent_title_edit(mock_db):
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
        f"job completion must not overwrite the concurrently-edited title with "
        f"its stale job-start snapshot. Got: {final_doc['title']}"
    )


def _tts_blob_mock():
    async def _upload_file(container, blob_name, *args, **kwargs):
        return f"https://myaccount.blob.core.windows.net/{container}/{blob_name}"

    mock_blob = MagicMock()
    mock_blob.get_container_client = MagicMock(side_effect=Exception("no theme audio yet"))
    mock_blob.upload_file = AsyncMock(side_effect=_upload_file)
    return mock_blob


async def _run_pull_model_job(mock_db, synthesize):
    from app.consumers.content_job_consumer import _process_audio_content_job

    content_id, job_id, content_repo, job_repo = await _seed(
        mock_db,
        is_pull_model=True,
        title={"english": "Old Title", "local": "Old Title"},
        theme={"english": "Animals", "local": "Animals"},
        audio_content=[],
    )
    with (
        patch("app.services.tts_service.synthesize", new=AsyncMock(side_effect=synthesize)),
        patch(
            "app.services.tts_service.add_for_in_option_audio",
            side_effect=lambda language, text: text,
        ),
    ):
        job_doc = await mock_db["content_jobs"].find_one({"_id": job_id})
        await _process_audio_content_job(job_doc, job_repo, content_repo, _tts_blob_mock())

    final_doc = await mock_db["contentsV3"].find_one({"_id": ObjectId(content_id)})
    job = await mock_db["content_jobs"].find_one({"_id": job_id})
    return content_id, final_doc, job


@pytest.mark.asyncio
async def test_pull_model_tts_persists_audio_urls(mock_db):
    async def _synthesize(*args, **kwargs):
        return b"fake_tts_audio"

    content_id, final_doc, job = await _run_pull_model_job(mock_db, _synthesize)

    assert final_doc["title"] == {
        "english": "Old Title",
        "local": "Old Title",
        "audio_url": f"https://myaccount.blob.core.windows.net/experience-titles/{content_id}/1.0.mp3",
    }
    assert final_doc["theme"]["audio_url"] == "https://myaccount.blob.core.windows.net/theme-titles/Animals/1.0.mp3"
    assert final_doc["is_processed"] is True
    assert job["status"] == "completed"


@pytest.mark.asyncio
async def test_concurrent_title_edit_during_tts_discards_stale_audio_url(mock_db, caplog):
    async def _synthesize_while_title_and_theme_are_edited(*args, **kwargs):
        await mock_db["contentsV3"].update_many(
            {},
            {
                "$set": {
                    "title": {"english": "New Title", "local": "New Title"},
                    "theme": {"english": "Space", "local": "Space"},
                }
            },
        )
        return b"fake_tts_audio"

    _, final_doc, job = await _run_pull_model_job(mock_db, _synthesize_while_title_and_theme_are_edited)

    assert final_doc["title"] == {"english": "New Title", "local": "New Title"}
    assert final_doc["theme"] == {"english": "Space", "local": "Space"}
    assert "is_processed" not in final_doc
    assert job["status"] == "completed"
    assert "title/theme changed during TTS" in caplog.text


@pytest.mark.asyncio
async def test_content_removed_during_tts_logs_missing_document(mock_db, caplog):
    async def _synthesize_while_content_is_removed(*args, **kwargs):
        await mock_db["contentsV3"].delete_many({})
        return b"fake_tts_audio"

    _, final_doc, job = await _run_pull_model_job(mock_db, _synthesize_while_content_is_removed)

    assert final_doc is None
    assert job["status"] == "completed"
    assert "content document removed during processing" in caplog.text
    assert "title/theme changed during TTS" not in caplog.text


@pytest.mark.asyncio
async def test_existing_theme_audio_is_reused_without_resynthesizing():
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
        result = await _process_tts_for_content(content_doc, mock_blob_provider)

    assert result.theme_audio_url == existing_blob_url
    assert result.title_audio_url is None
    mock_synthesize.assert_not_called()
    mock_blob_provider.upload_file.assert_not_called()
