from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from bson import ObjectId

from app.consumers.content_job_consumer import _process_audio_content_job
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


async def _run(db, job_doc):
    await _process_audio_content_job(
        job_doc,
        ContentJobRepository(db),
        ContentRepository(db),
        MagicMock(),
    )
    return await db["content_jobs"].find_one({"_id": job_doc["_id"]})


async def test_aggregator_job_processes_contents_v3_item(db):
    inserted = await db["contentsV3"].insert_one(
        {"tenant_id": ObjectId(TENANT), "audio_content": [], "is_processed": False, "is_deleted": False}
    )
    content_id = str(inserted.inserted_id)
    job_id = await ContentJobRepository(db).create(content_id, TENANT, "hexis-adapter")
    job_doc = await ContentJobRepository(db).find_by_id(job_id)

    job = await _run(db, job_doc)

    assert job["status"] == "completed"
    assert (await db["contentsV3"].find_one({"_id": inserted.inserted_id}))["is_processed"] is True
    assert await db["contentAggregators"].count_documents({}) == 0


async def test_teacher_job_still_processes_contents_v3_item(db):
    content_id = str(ObjectId())
    await db["contentsV3"].insert_one({"_id": ObjectId(content_id), "audio_content": [], "is_processed": False})
    job_id = await ContentJobRepository(db).create(content_id)
    job_doc = await ContentJobRepository(db).find_by_id(job_id)

    job = await _run(db, job_doc)

    assert job["status"] == "completed"
    assert (await db["contentsV3"].find_one({"_id": ObjectId(content_id)}))["is_processed"] is True
