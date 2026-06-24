"""
Integration tests for call_controller, webhook_controller, participants_controller,
playback_controller, ivr_structure_controller.
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
    db = client["seeds_test_call"]
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


async def _seed_teacher(mock_db, email="teacher@call.com", password="callpass123"):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "Call Teacher",
        "email": email,
        "hashed_password": hash_password(password),
        "tenant_id": "t1",
        "school_id": "s1",
        "is_active": True,
    }
    result = await mock_db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(user_id, tenant_id="t1", school_id="s1"):
    return create_access_token({"sub": user_id, "role": "teacher", "tenant_id": tenant_id, "school_id": school_id})


# ---------------------------------------------------------------------------
# Call controller — basic auth checks
# ---------------------------------------------------------------------------


class TestCallController:
    @pytest.mark.asyncio
    async def test_create_conference_requires_auth(self, client, mock_db):
        resp = await client.post("/conference/create", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_call_status_requires_auth(self, client, mock_db):
        resp = await client.get("/call/some_conf/status")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_log_call_requires_auth(self, client, mock_db):
        resp = await client.post("/call/logCall", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_access_token_requires_auth(self, client, mock_db):
        resp = await client.get("/call/accessToken")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_save_fsm_context_requires_auth(self, client, mock_db):
        resp = await client.post("/call/fsmContext", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_call_status_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        # IVR server URL not configured in test, should get 503
        resp = await client.get("/call/nonexistent/status", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404, 503)

    @pytest.mark.asyncio
    async def test_log_call_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.post("/call/logCall", json={
            "conferenceId": "conf1",
            "teacherPhone": "+111",
            "studentPhones": ["+222"],
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 422)

    @pytest.mark.asyncio
    async def test_fsm_context_get_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/call/fsmContext/nonexistent", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Webhook controller — basic checks
# ---------------------------------------------------------------------------


class TestWebhookController:
    @pytest.mark.asyncio
    async def test_webhook_event_endpoint_exists(self, client, mock_db):
        """POST /event should return 200 (accepts any JSON in dev mode)."""
        resp = await client.post("/event", json={
            "status": "answered",
            "conversation_uuid": "conv1",
        })
        # In dev mode without HMAC, should be accepted
        assert resp.status_code in (200, 204, 422)

    @pytest.mark.asyncio
    async def test_webhook_rtc_event_endpoint_exists(self, client, mock_db):
        resp = await client.post("/rtc-event", json={
            "type": "leg:status:update",
            "conversation_id": "conv1",
        })
        assert resp.status_code in (200, 204, 422)

    @pytest.mark.asyncio
    async def test_webhook_answer_endpoint_exists(self, client, mock_db):
        resp = await client.get("/answer")
        assert resp.status_code in (200, 204, 422)

    @pytest.mark.asyncio
    async def test_conference_webhook_event_exists(self, client, mock_db):
        # The webhook requires conference_manager to be initialized. In test mode,
        # it will return 500 due to RuntimeError, or 200/204 if manager is up.
        from app.platform.lifespan import get_conference_manager
        mock_mgr = MagicMock()
        mock_mgr.get_conference = MagicMock(return_value=None)
        with patch("app.controllers.webhook_controller.get_conference_manager", return_value=mock_mgr):
            resp = await client.post("/webhooks/event/conf1", json={
                "status": "answered",
                "conversation_uuid": "conv1",
            })
        assert resp.status_code in (200, 204, 422)

    @pytest.mark.asyncio
    async def test_conference_webhook_health(self, client, mock_db):
        resp = await client.get("/webhooks/event")
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Participants controller
# ---------------------------------------------------------------------------


class TestParticipantsController:
    @pytest.mark.asyncio
    async def test_add_participant_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/addparticipant/conf1", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_remove_participant_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/removeparticipant/conf1", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_mute_all_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/muteall/conf1", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_unmute_all_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/unmuteall/conf1", json={})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Playback controller
# ---------------------------------------------------------------------------


class TestPlaybackController:
    @pytest.mark.asyncio
    async def test_play_audio_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/playaudio/conf1", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_pause_audio_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/pauseaudio/conf1", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_resume_audio_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/resumeaudio/conf1", json={})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# IVR structure controller
# ---------------------------------------------------------------------------


class TestIVRStructureController:
    @pytest.mark.asyncio
    async def test_get_ivr_structure_requires_auth(self, client, mock_db):
        resp = await client.get("/ivr-structure")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_ivr_by_id_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/ivr/nonexistent", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_start_ivr_requires_auth(self, client, mock_db):
        resp = await client.post("/start-ivr", json={})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# School controller — CRUD
# ---------------------------------------------------------------------------


class TestSchoolControllerCRUD:
    @pytest.mark.asyncio
    async def test_get_school_by_id(self, client, mock_db):
        from app.services.auth_service import TenantCreate, register_tenant

        data = TenantCreate(name="CRUD Tenant", email="crud@tenant.com", password="tenantpass")
        user = await register_tenant(data, mock_db)
        token = create_access_token({"sub": str(user.id), "role": "tenant"})

        # Create a school first
        create_resp = await client.post("/school", json={
            "name": "CRUD School",
            "email": "crudschool@test.com",
            "password": "schoolpass",
        }, headers={"Authorization": f"Bearer {token}"})
        assert create_resp.status_code == 201
        school_id = create_resp.json()["_id"]

        # Fetch it
        get_resp = await client.get(f"/school/{school_id}", headers={"Authorization": f"Bearer {token}"})
        assert get_resp.status_code == 200
        assert get_resp.json()["name"] == "CRUD School"

    @pytest.mark.asyncio
    async def test_delete_school(self, client, mock_db):
        from app.services.auth_service import TenantCreate, register_tenant

        data = TenantCreate(name="Del Tenant", email="del@tenant.com", password="tenantpass")
        user = await register_tenant(data, mock_db)
        token = create_access_token({"sub": str(user.id), "role": "tenant"})

        create_resp = await client.post("/school", json={
            "name": "To Delete",
            "email": "todelete@test.com",
            "password": "schoolpass",
        }, headers={"Authorization": f"Bearer {token}"})
        assert create_resp.status_code == 201
        school_id = create_resp.json()["_id"]

        del_resp = await client.delete(f"/school/{school_id}", headers={"Authorization": f"Bearer {token}"})
        assert del_resp.status_code in (200, 204)
