from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from bson import ObjectId

from app.consumers.content_job_consumer import _process_audio_content_job
from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"


@pytest.fixture
def db():
    return AsyncMongoMockClient()["test_seeds"]


async def _run(db, job_doc):
    await _run_job(db, job_doc)
    return await db["content_jobs"].find_one({"_id": job_doc["_id"]})


async def _run_job(db, job_doc):
    await _process_audio_content_job(
        job_doc,
        ContentJobRepository(db),
        ContentRepository(db),
        ContentAggregatorRepository(db),
        MagicMock(),
    )


async def test_aggregator_job_processes_content_aggregators_item(db):
    await db["contentAggregators"].insert_one(
        {"tenant_id": TENANT, "content_id": "c1", "audio_content": [], "is_processed": False, "is_deleted": False}
    )
    job_id = await ContentJobRepository(db).create("c1", TENANT, "hexis-adapter")
    job_doc = await ContentJobRepository(db).find_by_id(job_id)

    job = await _run(db, job_doc)

    assert job["status"] == "completed"
    assert (await db["contentAggregators"].find_one({"content_id": "c1"}))["is_processed"] is True
    assert await db["contentsV3"].count_documents({}) == 0


async def test_teacher_job_still_processes_contents_v3_item(db):
    content_id = str(ObjectId())
    await db["contentsV3"].insert_one({"_id": ObjectId(content_id), "audio_content": [], "is_processed": False})
    job_id = await ContentJobRepository(db).create(content_id)
    job_doc = await ContentJobRepository(db).find_by_id(job_id)

    job = await _run(db, job_doc)

    assert job["status"] == "completed"
    assert (await db["contentsV3"].find_one({"_id": ObjectId(content_id)}))["is_processed"] is True
