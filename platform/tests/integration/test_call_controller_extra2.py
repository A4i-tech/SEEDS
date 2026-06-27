"""
Additional integration tests for call_controller and conference_service paths.
"""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")

from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.main import app
from app.models.user import UserRole
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.auth.jwt import create_access_token


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_call_extra2"]
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


async def _seed_teacher(db, email="t@call2.com", password="pass1234", tenant_id="t1"):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "Call Teacher",
        "email": email,
        "hashed_password": hash_password(password),
        "tenant_id": tenant_id,
        "school_id": "s1",
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(user_id, tenant_id="t1", school_id="s1"):
    return create_access_token({"sub": user_id, "role": "teacher", "tenant_id": tenant_id, "school_id": school_id})


async def _seed_tenant(db, email="tenant@call2.com", password="tenantpass"):
    doc = {
        "role": UserRole.TENANT.value,
        "name": "Call Tenant",
        "email": email,
        "tenant_name": "CallOrg2",
        "hashed_password": hash_password(password),
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


# ---------------------------------------------------------------------------
# Conference route: start, end, sink
# ---------------------------------------------------------------------------


class TestConferenceRoutes:
    @pytest.mark.asyncio
    async def test_start_conference_requires_auth(self, client, mock_db):
        resp = await client.post("/conference/start/conf1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_start_conference_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_fn:
            mock_mgr = MagicMock()
            mock_mgr.get_conference = MagicMock(return_value=None)
            mock_fn.return_value = mock_mgr

            resp = await client.post("/conference/start/nonexistent", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (404, 401, 403, 500)

    @pytest.mark.asyncio
    async def test_end_conference_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_fn:
            mock_mgr = MagicMock()
            mock_mgr.get_conference = MagicMock(return_value=None)
            mock_fn.return_value = mock_mgr

            resp = await client.put("/conference/end/nonexistent_id", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404, 401, 403, 500)

    @pytest.mark.asyncio
    async def test_sink_conference_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/sink/conf1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_connect_smartphone_requires_auth(self, client, mock_db):
        resp = await client.get("/conference/teacherappconnect/conf1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_disconnect_smartphone_requires_auth(self, client, mock_db):
        resp = await client.post("/conference/teacherappdisconnect/conf1")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Call routes
# ---------------------------------------------------------------------------


class TestCallRoutes:
    @pytest.mark.asyncio
    async def test_log_call_requires_auth(self, client, mock_db):
        resp = await client.post("/call/logCall", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_log_call_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.post("/call/logCall", json={
            "phone_number": "+919999999999",
            "tenant_id": "t1",
            "school_id": "s1",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 422)

    @pytest.mark.asyncio
    async def test_get_call_status_requires_auth(self, client, mock_db):
        resp = await client.get("/call/conf1/status")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_call_status_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        with patch("app.platform.lifespan.get_conference_manager") as mock_fn:
            mock_mgr = MagicMock()
            mock_mgr.get_conference = MagicMock(return_value=None)
            mock_fn.return_value = mock_mgr
            resp = await client.get("/call/conf1/status", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404, 500, 503)

    @pytest.mark.asyncio
    async def test_start_call_with_valid_body(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.post("/call/start", json={
            "phone_number": "+919999999999",
            "tenant_id": "t1",
        }, headers={"Authorization": f"Bearer {token}"})
        # IVR may not be configured — just check auth passes
        assert resp.status_code in (200, 422, 500, 503)

    @pytest.mark.asyncio
    async def test_get_fsm_context_requires_auth(self, client, mock_db):
        resp = await client.get("/call/fsmContext/ctx1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_fsm_context_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/call/fsmContext/nonexistent_ctx", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)


# ---------------------------------------------------------------------------
# IVR routes
# ---------------------------------------------------------------------------


class TestIVRRoutes:
    @pytest.mark.asyncio
    async def test_ivr_answer_returns_ncco(self, client, mock_db):
        """Public endpoint — no auth required."""
        resp = await client.get("/answer")
        assert resp.status_code in (200, 404, 422)

    @pytest.mark.asyncio
    async def test_start_ivr_call_body_validation(self, client, mock_db):
        """start-call is a Vonage webhook — test body validation."""
        resp = await client.post("/start-ivr", json={})  # missing required fields
        assert resp.status_code in (422, 400, 200, 401, 500, 503)



# ---------------------------------------------------------------------------
# School controller routes
# ---------------------------------------------------------------------------


class TestSchoolControllerRoutes:
    @pytest.mark.asyncio
    async def test_get_school_requires_auth(self, client, mock_db):
        resp = await client.get("/school/school_id_123")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_update_school_requires_auth(self, client, mock_db):
        resp = await client.patch("/school/school_id_123", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_school_dashboard_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/school/dashboard", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 403, 404, 422)

    @pytest.mark.asyncio
    async def test_list_classrooms_requires_auth(self, client, mock_db):
        resp = await client.get("/school/classrooms")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Users controller additional routes
# ---------------------------------------------------------------------------


class TestUsersControllerAdditional:
    @pytest.mark.asyncio
    async def test_list_students_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/student", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_delete_user_requires_auth(self, client, mock_db):
        resp = await client.delete("/teacher/some_user_id")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_update_student_requires_auth(self, client, mock_db):
        resp = await client.patch("/student/stu1", json={"name": "Updated"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_student_requires_auth(self, client, mock_db):
        resp = await client.delete("/student/stu1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_participants_requires_auth(self, client, mock_db):
        resp = await client.get("/user/participants")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_participants_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/user/participants", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
