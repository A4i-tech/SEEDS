"""
Integration tests for backend Phase 2 — content, calls, audit controllers +
content job consumer.

Uses mongomock-motor (no real MongoDB) and httpx.AsyncClient.

Coverage:
  - test_list_content_requires_auth
  - test_create_content_triggers_job
  - test_content_tenant_scoped
  - test_list_calls_requires_teacher
  - test_content_job_consumer_process_audio
  - test_content_job_dead_letter_on_failure
"""

from __future__ import annotations

import os
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

# Set minimal env vars before app imports resolve settings
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")
os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "")
os.environ.setdefault("DB_CONNECTION", "")

from datetime import UTC

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def mock_db():
    """Return a mongomock-motor in-memory database."""
    client = AsyncMongoMockClient()
    db = client["seeds_test"]
    yield db
    client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    """Return an httpx AsyncClient wired to the FastAPI app with mock DB."""

    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()


# ---------------------------------------------------------------------------
# Token helpers
# ---------------------------------------------------------------------------


def _teacher_token(
    user_id: str = "user001",
    tenant_id: str = "tenant001",
    school_id: str = "school001",
) -> str:
    return create_access_token(
        {"sub": user_id, "role": "teacher", "tenant_id": tenant_id, "school_id": school_id}
    )


def _tenant_token(user_id: str = "tenant001") -> str:
    return create_access_token({"sub": user_id, "role": "tenant", "tenant_id": user_id})


def _content_creator_token(
    user_id: str = "creator001",
    tenant_id: str = "tenant001",
) -> str:
    return create_access_token({"sub": user_id, "role": "content_creator", "tenant_id": tenant_id})


def _tenant_b_token(user_id: str = "tenant_b") -> str:
    return create_access_token({"sub": user_id, "role": "tenant", "tenant_id": user_id})


# ---------------------------------------------------------------------------
# Test: list_content_requires_auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_content_requires_auth(client):
    """GET /content without auth token returns 401."""
    resp = await client.get("/content")
    assert resp.status_code == 401, f"Expected 401, got {resp.status_code}: {resp.text}"


# ---------------------------------------------------------------------------
# Test: create_content_triggers_job
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_content_triggers_job(client, mock_db):
    """POST /content with a valid token creates a content doc and a pending job."""
    token = _tenant_token()

    resp = await client.post(
        "/content",
        json={
            "type": "Story",
            "language": "kannada",
            "title": {"english": "Test Story", "local": "ಪರೀಕ್ಷೆ"},
            "theme": {"english": "Animals", "local": "ಪ್ರಾಣಿಗಳು"},
            "audioContent": [],
            "isPullModel": False,
        },
        headers={"Authorization": f"Bearer {token}"},
    )

    assert resp.status_code == 201, f"Expected 201, got {resp.status_code}: {resp.text}"
    body = resp.json()
    assert "jobId" in body, "Response must include jobId"
    assert body.get("message") == "Processing New Content job scheduled!"

    # Verify job record created in DB
    job_doc = await mock_db["content_jobs"].find_one({"_id": body["jobId"]})
    assert job_doc is not None, "Job document must exist in content_jobs collection"
    assert job_doc["status"] == "pending"


# ---------------------------------------------------------------------------
# Test: content_tenant_scoped
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_content_tenant_scoped(client, mock_db):
    """A user from tenant_A cannot read tenant_B content via GET /content/{id}."""
    # Seed content for tenant_b
    content_id = str(uuid.uuid4())
    await mock_db["contentsV3"].insert_one({
        "_id": content_id,
        "tenantId": "tenant_b",
        "type": "Story",
        "language": "english",
        "title": {"english": "B Story"},
        "theme": {"english": "Animals"},
        "audioContent": [],
        "isPullModel": False,
        "isDeleted": False,
        "creation_time": 1000,
    })

    # Tenant A tries to fetch tenant B's content
    token_a = _tenant_token(user_id="tenant_a")
    resp = await client.get(
        f"/content/{content_id}",
        headers={"Authorization": f"Bearer {token_a}"},
    )
    # Should return 404 (not found in tenant scope) which is the expected behavior
    # since tenant scoping filters by tenantId = "tenant_a" but the doc has "tenant_b"
    assert resp.status_code == 404, (
        f"Expected 404 (tenant isolation), got {resp.status_code}: {resp.text}"
    )


# ---------------------------------------------------------------------------
# Test: list_calls_requires_teacher
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_calls_requires_teacher(client):
    """GET /call/logCall/{id} with a tenant-only token returns 403 (teacher required)."""
    token = _tenant_token()
    # Use a plausible ObjectId-like string
    resp = await client.get(
        "/call/logCall/000000000000000000000001",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403, f"Expected 403, got {resp.status_code}: {resp.text}"


# ---------------------------------------------------------------------------
# Test: content_job_consumer_process_audio
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_content_job_consumer_process_audio(mock_db):
    """ContentJobConsumer processes a pending job: mocks ffmpeg + blob, verifies temp file cleanup."""
    import os
    import tempfile
    from datetime import datetime

    content_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    # Seed a content document
    await mock_db["contentsV3"].insert_one({
        "_id": content_id,
        "tenantId": "tenant001",
        "type": "Story",
        "language": "kannada",
        "title": {"english": "Test", "local": "ಪರೀಕ್ಷೆ"},
        "theme": {"english": "Animals", "local": "ಪ್ರಾಣಿಗಳು"},
        "audioContent": [{"audioUrl": "https://myaccount.blob.core.windows.net/input-container/test.mp3"}],
        "isPullModel": False,
        "isDeleted": False,
        "creation_time": 1000,
    })

    # Seed a pending job
    await mock_db["content_jobs"].insert_one({
        "_id": job_id,
        "content_id": content_id,
        "status": "pending",
        "created_at": datetime.now(UTC),
    })

    # Track temp files created
    created_temp_files: list = []
    original_mkstemp = tempfile.mkstemp

    def _tracking_mkstemp(**kwargs):
        fd, path = original_mkstemp(**kwargs)
        created_temp_files.append(path)
        return fd, path

    # Mock blob provider
    mock_blob = MagicMock()
    mock_blob.download_from_url = AsyncMock(return_value=b"fake_audio_data_12345")
    mock_blob.upload_file = AsyncMock(return_value="https://myaccount.blob.core.windows.net/output-container/test.wav")
    mock_blob.get_container_client = MagicMock()

    with patch("tempfile.mkstemp", side_effect=_tracking_mkstemp), \
         patch(
             "app.consumers.content_job_consumer._transcode_to_wav",
             new=AsyncMock(side_effect=lambda inp, out: open(out, "wb").write(b"fake_wav_data") or None),
         ):
        from app.consumers.content_job_consumer import _process_audio_content_job
        from app.repositories.content_job_repository import ContentJobRepository
        from app.repositories.content_repository import ContentRepository

        job_doc = await mock_db["content_jobs"].find_one({"_id": job_id})
        await _process_audio_content_job(job_doc, ContentJobRepository(mock_db), ContentRepository(mock_db), mock_blob)

    # Verify job marked complete
    updated_job = await mock_db["content_jobs"].find_one({"_id": job_id})
    assert updated_job["status"] == "completed", (
        f"Expected status=completed, got {updated_job['status']}"
    )

    # Verify temp files were cleaned up
    for p in created_temp_files:
        assert not os.path.exists(p), f"Temp file {p} was not cleaned up"


# ---------------------------------------------------------------------------
# Test: content_job_dead_letter_on_failure
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_content_job_dead_letter_on_failure(mock_db):
    """A job with a corrupt blob URL is dead-lettered: status=failed with reason set."""
    from datetime import datetime

    content_id = str(uuid.uuid4())
    job_id = str(uuid.uuid4())

    # Seed content with a bad audio URL (not a valid blob URL)
    await mock_db["contentsV3"].insert_one({
        "_id": content_id,
        "tenantId": "tenant001",
        "type": "Story",
        "language": "english",
        "title": {"english": "Broken"},
        "theme": {"english": "Errors"},
        "audioContent": [{"audioUrl": "https://myaccount.blob.core.windows.net/input-container/corrupt.mp3"}],
        "isPullModel": False,
        "isDeleted": False,
        "creation_time": 1000,
    })

    await mock_db["content_jobs"].insert_one({
        "_id": job_id,
        "content_id": content_id,
        "status": "pending",
        "created_at": datetime.now(UTC),
    })

    # Mock blob provider to always fail
    mock_blob = MagicMock()
    mock_blob.download_from_url = AsyncMock(side_effect=RuntimeError("Corrupt input: download failed"))

    from app.consumers.content_job_consumer import _process_audio_content_job
    from app.repositories.content_job_repository import ContentJobRepository
    from app.repositories.content_repository import ContentRepository

    job_doc = await mock_db["content_jobs"].find_one({"_id": job_id})

    with pytest.raises(RuntimeError):
        await _process_audio_content_job(job_doc, ContentJobRepository(mock_db), ContentRepository(mock_db), mock_blob)

    # Verify job dead-lettered
    failed_job = await mock_db["content_jobs"].find_one({"_id": job_id})
    assert failed_job["status"] == "failed", (
        f"Expected status=failed, got {failed_job['status']}"
    )
    assert "reason" in failed_job and failed_job["reason"], "Failed job must have a reason"
    assert "failed_at" in failed_job, "Failed job must have failed_at timestamp"
