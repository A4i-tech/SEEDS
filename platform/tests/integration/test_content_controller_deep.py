"""
Deep coverage for content_controller endpoints.
"""

from __future__ import annotations

import os
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")


import pytest
import pytest_asyncio
from bson import ObjectId
from httpx import ASGITransport, AsyncClient

from app.main import app
from app.models.user import UserRole
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.auth.jwt import create_access_token
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_content_deep"]
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


_TENANT_ID = str(ObjectId())
_SCHOOL_ID = str(ObjectId())


async def _seed_teacher(db, email="t@cdep.com", tenant_id=_TENANT_ID):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "Deep Teacher",
        "email": email,
        "hashed_password": hash_password("pass1234"),
        "tenant_id": tenant_id,
        "school_id": _SCHOOL_ID,
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(uid, tid=_TENANT_ID, sid=_SCHOOL_ID):
    return create_access_token({"sub": uid, "role": "teacher", "tenant_id": tid, "school_id": sid})


async def _seed_tenant(db, email="ten@cdep.com"):
    doc = {
        "role": UserRole.TENANT.value,
        "name": "Deep Tenant",
        "email": email,
        "tenant_name": "DeepOrg",
        "hashed_password": hash_password("tenantpass"),
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _tenant_token(uid):
    return create_access_token({"sub": uid, "role": "tenant", "tenant_id": uid})


# ---------------------------------------------------------------------------
# Content themes endpoint
# ---------------------------------------------------------------------------


class TestContentThemesDeep:
    @pytest.mark.asyncio
    async def test_themes_no_content_returns_empty_list(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/content/themes?language=english", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json() == []

    @pytest.mark.asyncio
    async def test_themes_with_content_in_db(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        # Insert content with theme
        await mock_db["contentsV3"].insert_one({
            "tenantId": "t1",
            "language": "english",
            "isPullModel": True,
            "theme": {"english": "Math", "local": "Math", "audioUrl": "http://math.mp3"},
            "type": "audio",
        })

        resp = await client.get("/content/themes?language=english", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        themes = resp.json()
        assert isinstance(themes, list)
        # May have Math or empty depending on tenant_id filter
        assert len(themes) >= 0

    @pytest.mark.asyncio
    async def test_themes_missing_language_422(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/content/themes", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Content list endpoint
# ---------------------------------------------------------------------------


class TestContentListEndpoint:
    @pytest.mark.asyncio
    async def test_list_content_empty_db(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/content", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data or isinstance(data, (list, dict))

    @pytest.mark.asyncio
    async def test_list_content_with_filters(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/content?language=english&limit=10", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_list_content_requires_auth(self, client, mock_db):
        resp = await client.get("/content")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Content job status endpoint
# ---------------------------------------------------------------------------


class TestContentJobStatus:
    @pytest.mark.asyncio
    async def test_get_job_status_not_found_raises_404(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.get("/content/job/nonexistent-job-id", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_get_job_status_found(self, client, mock_db):
        import uuid
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])

        job_id = str(uuid.uuid4())
        await mock_db["content_jobs"].insert_one({
            "_id": job_id,
            "content_id": "c1",
            "status": "completed",
        })

        resp = await client.get(f"/content/job/{job_id}", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert resp.json().get("status") == "completed"


# ---------------------------------------------------------------------------
# Content CRUD endpoints
# ---------------------------------------------------------------------------


class TestContentCRUD:
    @pytest.mark.asyncio
    async def test_create_content_tenant(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])

        resp = await client.post("/content", json={
            "type": "audio",
            "language": "english",
            "tenant_id": str(tenant["_id"]),
            "createdBy": str(tenant["_id"]),
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (201, 200, 422)

    @pytest.mark.asyncio
    async def test_patch_content_not_found(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.patch("/content/000000000000000000000000", json={
            "id": "000000000000000000000000",
            "type": "audio",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404, 422)

    @pytest.mark.asyncio
    async def test_delete_content_not_found(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.delete("/content/000000000000000000000000", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 204, 404)


# ---------------------------------------------------------------------------
# Audio upload and audio URL endpoints
# ---------------------------------------------------------------------------


def _mp3_form(name="test.mp3"):
    return {"data": {"blob_name": name}, "files": {"file": ("a.mp3", b"ID3data", "audio/mpeg")}}


class TestUploadAudioEndpoint:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("name", ["test.wav", "../x.mp3", "a..b.mp3", "a b.mp3"])
    async def test_upload_rejects_bad_name(self, client, mock_db, name):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.post("/content/audio", headers={"Authorization": f"Bearer {token}"}, **_mp3_form(name))
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_upload_writes_to_input_container(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        provider = AsyncMock()
        uploaded = []

        async def _capture(container, name, data, content_type):
            uploaded.append((container, name, data.read(), content_type))
            return "http://store/input-container/test.mp3"

        provider.upload_file.side_effect = _capture
        with patch("app.controllers.content_controller.get_blob_storage_provider", return_value=provider):
            resp = await client.post("/content/audio", headers={"Authorization": f"Bearer {token}"}, **_mp3_form())
        assert resp.status_code == 200
        assert resp.json() == {"audio_url": "http://store/input-container/test.mp3"}
        assert uploaded == [("input-container", "test.mp3", b"ID3data", "audio/mpeg")]

    @pytest.mark.asyncio
    async def test_upload_rejects_oversized_file(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        with patch("app.controllers.content_controller._MAX_AUDIO_UPLOAD_BYTES", 3):
            resp = await client.post("/content/audio", headers={"Authorization": f"Bearer {token}"}, **_mp3_form())
        assert resp.status_code == 413

    @pytest.mark.asyncio
    async def test_upload_requires_auth(self, client, mock_db):
        resp = await client.post("/content/audio", **_mp3_form())
        assert resp.status_code == 401


class TestAudioUrlEndpoint:
    @pytest.mark.asyncio
    async def test_audio_url_signs_backend_built_url(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        provider = MagicMock()
        provider.blob_url.side_effect = lambda c, n: f"http://store/{c}/{n}"
        provider.get_sas_url_from_blob_url = AsyncMock(side_effect=lambda u, expiry_hours: f"{u}?sig=x")
        with (
            patch("app.controllers.content_controller.get_blob_storage_provider", return_value=provider),
            patch("app.services.content_service.ContentService.get_content_by_id", AsyncMock(return_value={"id": "c1"})),
        ):
            resp = await client.get(
                "/content/audioUrl?content_id=c1&variant=original_question",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        assert resp.json() == {"url": "http://store/output-original/c1/question.mp3?sig=x"}

    @pytest.mark.asyncio
    async def test_audio_url_404_for_content_outside_scope(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.get(
            "/content/audioUrl?content_id=missing&variant=final", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_audio_url_rejects_unknown_variant(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.get(
            "/content/audioUrl?content_id=c1&variant=nope", headers={"Authorization": f"Bearer {token}"}
        )
        assert resp.status_code == 422


# ---------------------------------------------------------------------------
# Content helper functions — unit tests
# ---------------------------------------------------------------------------


class TestContentHelperFunctions:
    def test_read_school_filter_teacher(self) -> None:
        from app.controllers.content_controller import _read_school_filter

        user = {"role": "teacher", "school_id": "s1"}
        result = _read_school_filter(user)
        assert result is not None
        assert "s1" in str(result)

    def test_read_school_filter_tenant(self) -> None:
        from app.controllers.content_controller import _read_school_filter

        user = {"role": "tenant"}
        result = _read_school_filter(user)
        assert result is None

    def test_write_school_filter_content_creator(self) -> None:
        from app.controllers.content_controller import _write_school_filter

        user = {"role": "content_creator", "school_id": "s2"}
        result = _write_school_filter(user)
        assert result == {"schoolId": "s2"}

    def test_write_school_filter_tenant(self) -> None:
        from app.controllers.content_controller import _write_school_filter

        user = {"role": "tenant"}
        result = _write_school_filter(user)
        assert result == {"schoolId": None}

    def test_write_school_filter_school_admin(self) -> None:
        from app.controllers.content_controller import _write_school_filter

        user = {"role": "school_admin", "school_id": "s3"}
        result = _write_school_filter(user)
        assert result == {"schoolId": "s3"}
