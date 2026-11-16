"""
Regression tests for content-type-based content job dispatch (A4i-tech/.github#604).

Quiz creation used to enqueue a job that the consumer looked up in contentsV3,
where quizzes never live, so every quiz job was dead-lettered.
"""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")

import uuid
from datetime import UTC, datetime
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from bson import ObjectId
from httpx import ASGITransport, AsyncClient

from app.consumers.content_job_consumer import _process_content_job
from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.repositories.content_job_repository import ContentJobRepository
from app.repositories.content_repository import ContentRepository
from tests.support.mongomock_async import AsyncMongoMockClient

_TENANT_ID = str(ObjectId())


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_content_job_dispatch"]
    yield db
    await client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _auth_headers() -> dict[str, str]:
    token = create_access_token({"sub": str(ObjectId()), "role": "tenant", "tenant_id": _TENANT_ID})
    return {"Authorization": f"Bearer {token}"}


async def _seed_job(db, content_id: str, **extra) -> dict:
    job_doc = {
        "_id": str(uuid.uuid4()),
        "content_id": content_id,
        "status": "claimed",
        "created_at": datetime.now(UTC),
        **extra,
    }
    await db["content_jobs"].insert_one(job_doc)
    return job_doc


async def _status(db, job_id: str) -> dict:
    return await db["content_jobs"].find_one({"_id": job_id})


@pytest.mark.asyncio
async def test_create_content_enqueues_content_job(client, mock_db):
    resp = await client.post(
        "/content", json={"type": "story", "language": "english"}, headers=_auth_headers()
    )
    assert resp.status_code == 201, resp.text
    job = await _status(mock_db, resp.json()["job_id"])
    assert job["content_type"] == "content"
    assert job["status"] == "pending"


@pytest.mark.asyncio
async def test_create_quiz_enqueues_quiz_job(client, mock_db):
    resp = await client.post(
        "/content/quiz",
        json={"type": "quiz", "language": "english", "questions": []},
        headers=_auth_headers(),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["message"] == "Processing New Content job scheduled!"
    job = await _status(mock_db, body["job_id"])
    assert job["content_type"] == "quiz"
    assert await mock_db["quizData"].find_one({"_id": ObjectId(job["content_id"])}) is not None


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "extra", [{"content_type": "content"}, {}], ids=["content", "legacy_missing_type"]
)
async def test_content_and_legacy_jobs_use_audio_handler(mock_db, extra):
    job_doc = await _seed_job(mock_db, str(ObjectId()), **extra)
    with patch(
        "app.consumers.content_job_consumer._process_audio_content_job", new=AsyncMock()
    ) as audio_handler:
        await _process_content_job(
            job_doc, ContentJobRepository(mock_db), ContentRepository(mock_db), MagicMock()
        )
    audio_handler.assert_awaited_once()
    assert audio_handler.await_args.args[0] is job_doc


@pytest.mark.asyncio
async def test_quiz_job_completes_without_content_lookup(mock_db):
    job_doc = await _seed_job(mock_db, str(ObjectId()), content_type="quiz")
    content_repo = ContentRepository(mock_db)
    with (
        patch.object(content_repo, "find_raw_by_id", new=AsyncMock()) as lookup,
        patch(
            "app.consumers.content_job_consumer._process_audio_content_job", new=AsyncMock()
        ) as audio_handler,
    ):
        await _process_content_job(
            job_doc, ContentJobRepository(mock_db), content_repo, MagicMock()
        )
    lookup.assert_not_awaited()
    audio_handler.assert_not_awaited()
    job = await _status(mock_db, job_doc["_id"])
    assert job["status"] == "completed"
    assert "reason" not in job


@pytest.mark.asyncio
async def test_unsupported_content_type_is_dead_lettered(mock_db):
    job_doc = await _seed_job(mock_db, str(ObjectId()), content_type="video")
    with (
        patch(
            "app.consumers.content_job_consumer._process_audio_content_job", new=AsyncMock()
        ) as audio_handler,
        pytest.raises(ValueError, match="Unsupported content_type"),
    ):
        await _process_content_job(
            job_doc, ContentJobRepository(mock_db), ContentRepository(mock_db), MagicMock()
        )
    audio_handler.assert_not_awaited()
    job = await _status(mock_db, job_doc["_id"])
    assert job["status"] == "failed"
    assert job["reason"] == "Unsupported content_type: 'video'"


@pytest.mark.asyncio
async def test_missing_content_document_still_dead_letters(mock_db):
    job_doc = await _seed_job(mock_db, str(ObjectId()), content_type="content")
    with pytest.raises(RuntimeError, match="Content document not found"):
        await _process_content_job(
            job_doc, ContentJobRepository(mock_db), ContentRepository(mock_db), MagicMock()
        )
    job = await _status(mock_db, job_doc["_id"])
    assert job["status"] == "failed"


@pytest.mark.asyncio
async def test_transient_failure_retries_then_dead_letters(mock_db):
    job_doc = await _seed_job(mock_db, str(ObjectId()), content_type="content")
    content_repo = ContentRepository(mock_db)
    with (
        patch.object(
            content_repo, "find_raw_by_id", new=AsyncMock(side_effect=ConnectionError("db down"))
        ) as lookup,
        patch("app.consumers.content_job_consumer.asyncio.sleep", new=AsyncMock()),
        pytest.raises(ConnectionError),
    ):
        await _process_content_job(
            job_doc, ContentJobRepository(mock_db), content_repo, MagicMock()
        )
    assert lookup.await_count == 3
    job = await _status(mock_db, job_doc["_id"])
    assert job["status"] == "failed"
    assert job["reason"] == "db down"
