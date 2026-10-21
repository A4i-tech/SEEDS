from __future__ import annotations

import pytest

from app.repositories.content_aggregator_repository import ContentAggregatorRepository
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository
from app.services.content_aggregator.content import PartnerContentService
from app.services.content_aggregator.processors import (
    UnsupportedContentTypeError,
    get_processor,
)
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT = "69660fae7fccd4ee129e58ae"


@pytest.fixture
def service():
    db = AsyncMongoMockClient()["test_seeds"]
    return db, PartnerContentService(
        ContentAggregatorRepository(db), ContentRepository(db), ContentJobRepository(db)
    )


def test_get_processor_unknown_raises_unsupported_content_type(service):
    with pytest.raises(UnsupportedContentTypeError) as exc:
        get_processor("video", service[1])
    assert exc.value.code == "UNSUPPORTED_CONTENT_TYPE"
    assert exc.value.status_code == 400


async def test_audio_processor_enqueues_one_job(service):
    db, svc = service
    job_id = await get_processor("story", svc).process(TENANT, "c1")
    jobs = await db["content_jobs"].find({}).to_list(length=None)
    assert len(jobs) == 1
    assert str(jobs[0]["_id"]) == job_id or jobs[0]["id"] == job_id
