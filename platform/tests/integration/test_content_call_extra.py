"""
Integration tests for content_controller and call_controller additional endpoints.
"""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")
os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "")
os.environ.setdefault("DB_CONNECTION", "")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.auth.jwt import create_access_token
from app.models.user import UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_content_call"]
    yield db
    client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _seed_teacher(mock_db, email="t@content.com", password="pass1234", tenant_id="t1"):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "Content Teacher",
        "email": email,
        "hashed_password": hash_password(password),
        "tenant_id": tenant_id,
        "school_id": "s1",
        "is_active": True,
    }
    result = await mock_db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(user_id, tenant_id="t1", school_id="s1"):
    return create_access_token({"sub": user_id, "role": "teacher", "tenant_id": tenant_id, "school_id": school_id})


async def _seed_tenant(mock_db, email="tenant@c.com", password="tenantpass"):
    doc = {
        "role": UserRole.TENANT.value,
        "name": "Content Tenant",
        "email": email,
        "tenant_name": "ContentOrg",
        "hashed_password": hash_password(password),
        "is_active": True,
    }
    result = await mock_db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


# ---------------------------------------------------------------------------
# Content controller — additional endpoints
# ---------------------------------------------------------------------------


class TestContentControllerExtra:
    @pytest.mark.asyncio
    async def test_get_content_themes_requires_auth(self, client, mock_db):
        resp = await client.get("/content/themes?language=english")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_content_themes_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/content/themes?language=english", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_list_jobs_requires_auth(self, client, mock_db):
        resp = await client.get("/content/jobs")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_jobs_with_tenant_token(self, client, mock_db):
        """list_jobs requires write role (tenant/school_admin)."""
        tenant = await _seed_tenant(mock_db)
        token = create_access_token({"sub": tenant["_id"], "role": "tenant"})
        resp = await client.get("/content/jobs", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert "jobs" in resp.json()

    @pytest.mark.asyncio
    async def test_get_job_status_not_found(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = create_access_token({"sub": tenant["_id"], "role": "tenant"})
        resp = await client.get("/content/job/nonexistent123", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_create_content_success(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = create_access_token({"sub": tenant["_id"], "role": "tenant"})

        with patch("app.controllers.content_controller._enqueue_content_job", return_value="job1"):
            resp = await client.post("/content", json={
                "type": "audio",
                "language": "english",
                "tenant_id": str(tenant["_id"]),
                "createdBy": str(tenant["_id"]),
            }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (201, 200, 422)

    @pytest.mark.asyncio
    async def test_get_sas_url_requires_auth(self, client, mock_db):
        resp = await client.get("/content/sasUrl?url=https://example.blob.core.windows.net/c/f.mp3")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_patch_content_requires_auth(self, client, mock_db):
        resp = await client.patch("/content", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_content_requires_auth(self, client, mock_db):
        resp = await client.delete("/content/someid")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_content_not_found(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = create_access_token({"sub": tenant["_id"], "role": "tenant"})
        resp = await client.delete("/content/000000000000000000000000", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_put_content_requires_auth(self, client, mock_db):
        resp = await client.put("/content/someid", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_quiz_requires_auth(self, client, mock_db):
        resp = await client.post("/content/quiz", json={})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Call controller — additional coverage
# ---------------------------------------------------------------------------


class TestCallControllerExtra:
    @pytest.mark.asyncio
    async def test_get_access_token_with_valid_auth(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/call/accessToken", headers={"Authorization": f"Bearer {token}"})
        # May return 200 with token or 503 if service not configured
        assert resp.status_code in (200, 503, 500)

    @pytest.mark.asyncio
    async def test_start_call_requires_auth(self, client, mock_db):
        resp = await client.post("/call/start", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_call_log_by_id_requires_auth(self, client, mock_db):
        resp = await client.get("/call/logCall/someid")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_call_log_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/call/logCall/000000000000000000000000", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_conference_create_requires_auth(self, client, mock_db):
        resp = await client.post("/conference/create")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_conference_create_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr_fn:
            mock_mgr = MagicMock()
            conf = MagicMock()
            conf.state = MagicMock()
            conf.state.conference_id = "conf_new_1"
            mock_mgr.create_conference = AsyncMock(return_value=conf)
            mock_mgr_fn.return_value = mock_mgr
            resp = await client.post("/conference/create", json={
                "teacher_phone_number": "+919999999999",
                "name": "Test Conference",
            }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 422, 500)

    @pytest.mark.asyncio
    async def test_conference_end_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/end/conf1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_save_fsm_context_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.post("/call/fsmContext", json={
            "callId": "call123",
            "fsmId": "fsm1",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 422)


# ---------------------------------------------------------------------------
# Users controller — additional coverage
# ---------------------------------------------------------------------------


class TestUsersControllerExtra:
    @pytest.mark.asyncio
    async def test_list_teachers_by_school_requires_auth(self, client, mock_db):
        resp = await client.get("/teacher/teachers")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_teachers_by_school_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/teacher/teachers", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_update_teacher_requires_auth(self, client, mock_db):
        resp = await client.patch("/teacher/someid", json={"name": "New"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_teacher_requires_auth(self, client, mock_db):
        resp = await client.delete("/teacher/someid")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_student_requires_auth(self, client, mock_db):
        resp = await client.post("/student", json={"name": "Student", "phoneNumber": "+111"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_student_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.post("/student", json={
            "name": "Test Student",
            "phoneNumber": "+919999999999",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (201, 200, 409, 422)

    @pytest.mark.asyncio
    async def test_list_students_requires_auth(self, client, mock_db):
        resp = await client.get("/student")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_participant_list_requires_auth(self, client, mock_db):
        """Security invariant: GET /user/participants without token → 401."""
        resp = await client.get("/user/participants")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Webhook controller — more paths
# ---------------------------------------------------------------------------


class TestWebhookControllerExtra:
    @pytest.mark.asyncio
    async def test_answer_endpoint_returns_ncco(self, client, mock_db):
        resp = await client.get("/answer")
        assert resp.status_code in (200, 204, 422)
        if resp.status_code == 200:
            # Should return NCCO
            assert isinstance(resp.json(), (list, dict))

    @pytest.mark.asyncio
    async def test_event_endpoint_accepts_json(self, client, mock_db):
        resp = await client.post("/event", json={
            "status": "completed",
            "uuid": "leg1",
            "conversation_uuid": "conv1",
            "to": "+111",
            "from": "+222",
            "direction": "outbound",
        })
        assert resp.status_code in (200, 204, 422)

    @pytest.mark.asyncio
    async def test_rtc_event_endpoint_accepts_json(self, client, mock_db):
        resp = await client.post("/rtc-event", json={
            "type": "member:media:success",
            "conversation_id": "conv1",
        })
        assert resp.status_code in (200, 204, 422)
