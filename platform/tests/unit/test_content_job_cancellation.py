from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from bson import ObjectId

from app.consumers.content_job_consumer import _process_audio_content_job
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository
from app.repositories.content_request_repository import ContentRequestRepository
from app.services.content_service import ContentService
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"
OWNER = "690dbc1b3b41c70deffa2761"
COLLEAGUE = "690dbc1b3b41c70deffa2762"


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


async def _item_with_job(db, is_deleted: bool) -> tuple[str, str]:
    inserted = await db["contentsV3"].insert_one(
        {
            "tenant_id": ObjectId(TENANT),
            "school_id": None,
            "created_by": ObjectId(OWNER),
            "audio_content": [],
            "is_processed": False,
            "is_deleted": is_deleted,
        }
    )
    content_id = str(inserted.inserted_id)
    return content_id, await ContentJobRepository(db).create(content_id, TENANT, False)


async def test_consumer_cancels_the_job_of_content_deleted_before_it_saves(db):
    content_id, job_id = await _item_with_job(db, is_deleted=True)
    job_doc = await ContentJobRepository(db).claim_next_pending()

    await _process_audio_content_job(job_doc, ContentJobRepository(db), ContentRepository(db), ContentRequestRepository(db), MagicMock())

    assert (await db["content_jobs"].find_one({"_id": job_id}))["status"] == "cancelled"
    assert (await db["contentsV3"].find_one({"_id": ObjectId(content_id)}))["is_processed"] is False


async def test_consumer_stops_before_the_next_audio_item_once_the_content_is_deleted(db):
    content_id, job_id = await _item_with_job(db, is_deleted=False)
    await db["contentsV3"].update_one(
        {"_id": ObjectId(content_id)},
        {"$set": {"audio_content": [{"audio_url": f"https://a.blob/c/{n}.mp3"} for n in range(2)]}},
    )
    job_doc = await ContentJobRepository(db).claim_next_pending()
    processed = []

    async def delete_after_first_item(audio_url, content_id, blob_provider):
        processed.append(audio_url)
        await db["contentsV3"].update_one({"_id": ObjectId(content_id)}, {"$set": {"is_deleted": True}})
        return audio_url, 1.0

    with patch("app.consumers.content_job_consumer._process_audio_item", delete_after_first_item):
        await _process_audio_content_job(job_doc, ContentJobRepository(db), ContentRepository(db), ContentRequestRepository(db), MagicMock())

    assert len(processed) == 1
    assert (await db["content_jobs"].find_one({"_id": job_id}))["status"] == "cancelled"
    assert (await db["contentsV3"].find_one({"_id": ObjectId(content_id)}))["is_processed"] is False


async def test_consumer_still_completes_content_that_is_not_deleted(db):
    content_id, job_id = await _item_with_job(db, is_deleted=False)
    job_doc = await ContentJobRepository(db).claim_next_pending()

    await _process_audio_content_job(job_doc, ContentJobRepository(db), ContentRepository(db), ContentRequestRepository(db), MagicMock())

    assert (await db["content_jobs"].find_one({"_id": job_id}))["status"] == "completed"
    assert (await db["contentsV3"].find_one({"_id": ObjectId(content_id)}))["is_processed"] is True


async def test_teacher_side_delete_cancels_the_pending_job(db):
    content_id, job_id = await _item_with_job(db, is_deleted=False)

    matched = await ContentService(db).delete_content(content_id, TENANT, OWNER, None)

    assert matched == 1
    assert (await db["content_jobs"].find_one({"_id": job_id}))["status"] == "cancelled"


async def test_teacher_side_delete_by_a_colleague_does_not_cancel_the_job(db):
    content_id, job_id = await _item_with_job(db, is_deleted=False)

    matched = await ContentService(db).delete_content(content_id, TENANT, COLLEAGUE, None)

    assert matched == 0
    assert (await db["content_jobs"].find_one({"_id": job_id}))["status"] == "pending"
