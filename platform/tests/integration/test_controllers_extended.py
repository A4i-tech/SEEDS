"""
Extended controller integration tests.

Covers: auth_controller (tenant), school/classroom endpoints,
        users_controller, content_controller basics.
"""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")
os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "")
os.environ.setdefault("DB_CONNECTION", "")

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
    db = client["seeds_test_ext"]
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


async def _seed_teacher(mock_db, email="teacher@ext.com", password="pass1234", tenant_id="t1"):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "Ext Teacher",
        "email": email,
        "hashed_password": hash_password(password),
        "tenant_id": tenant_id,
        "school_id": "s1",
        "is_active": True,
    }
    result = await mock_db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def _seed_school(mock_db, email="admin@school.com", password="adminpass123", tenant_id="t1"):
    doc = {
        "name": "Test School",
        "email": email,
        "password": hash_password(password),  # legacy field name in schools collection
        "tenant_id": tenant_id,
        "is_active": True,
    }
    result = await mock_db["schools"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def _seed_tenant(mock_db, email="tenant@ext.com", password="tenantpass"):
    doc = {
        "role": UserRole.TENANT.value,
        "name": "Ext Tenant",
        "email": email,
        "tenant_name": "Ext Org",
        "hashed_password": hash_password(password),
        "is_active": True,
    }
    result = await mock_db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(user_id, tenant_id="t1", school_id="s1"):
    return create_access_token({"sub": user_id, "role": "teacher", "tenant_id": tenant_id, "school_id": school_id})


def _tenant_token(user_id):
    return create_access_token({"sub": user_id, "role": "tenant"})


# ---------------------------------------------------------------------------
# Auth controller — tenant endpoints
# ---------------------------------------------------------------------------


class TestTenantAuth:
    @pytest.mark.asyncio
    async def test_tenant_register_success(self, client, mock_db):
        resp = await client.post("/tenant/register", json={
            "email": "newt@ext.com",
            "password": "tenantpass",
            "tenantName": "New Org",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["email"] == "newt@ext.com"
        assert "hashed_password" not in data

    @pytest.mark.asyncio
    async def test_tenant_login_success(self, client, mock_db):
        await _seed_tenant(mock_db)
        resp = await client.post("/tenant/login", json={
            "email": "tenant@ext.com",
            "password": "tenantpass",
        })
        assert resp.status_code == 200
        assert "access_token" in resp.json()

    @pytest.mark.asyncio
    async def test_tenant_login_wrong_password(self, client, mock_db):
        await _seed_tenant(mock_db)
        resp = await client.post("/tenant/login", json={
            "email": "tenant@ext.com",
            "password": "wrongpass",
        })
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_tenant_me_requires_auth(self, client, mock_db):
        resp = await client.get("/tenant/me")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_tenant_me_with_token(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.get("/tenant/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "tenant@ext.com"
        assert "tenantName" in data

    @pytest.mark.asyncio
    async def test_tenant_logout_requires_auth(self, client, mock_db):
        resp = await client.post("/tenant/logout")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_tenant_names_public(self, client, mock_db):
        await _seed_tenant(mock_db, email="t1@t.com")
        resp = await client.get("/tenant/names")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_teacher_me_returns_profile(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/teacher/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == "teacher@ext.com"
        assert "hashed_password" not in data

    @pytest.mark.asyncio
    async def test_teacher_logout_success(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.post("/teacher/logout", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_school_admin_login(self, client, mock_db):
        await _seed_school(mock_db, email="admin@school.com", password="adminpass123")
        resp = await client.post("/school/admin/login", json={
            "email": "admin@school.com",
            "password": "adminpass123",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert "token" in data

    @pytest.mark.asyncio
    async def test_school_admin_me(self, client, mock_db):
        school = await _seed_school(mock_db, email="admin2@school.com", tenant_id="t1")
        token = create_access_token({
            "sub": school["_id"],
            "role": "school_admin",
            "school_id": school["_id"],
            "tenant_id": "t1",
        })
        resp = await client.get("/school/admin/me", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "email" in data
        assert "name" in data


# ---------------------------------------------------------------------------
# School controller
# ---------------------------------------------------------------------------


class TestSchoolController:
    @pytest.mark.asyncio
    async def test_create_school_success(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.post("/school", json={
            "name": "My School",
            "email": "school@ext.com",
            "password": "schoolpass123",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 201

    @pytest.mark.asyncio
    async def test_list_schools_empty(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.get("/school", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_get_school_not_found(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.get("/school/nonexistent123", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_create_classroom(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.post("/class", json={
            "name": "Class 5A",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_list_classes_for_school(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/class?schoolId=s1", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Users controller
# ---------------------------------------------------------------------------


class TestUsersController:
    @pytest.mark.asyncio
    async def test_get_student_list(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/student", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_participants_requires_auth(self, client, mock_db):
        """Security invariant: GET /user/participants must require authentication."""
        resp = await client.get("/user/participants")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_participants_returns_list(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/user/participants", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# Content controller
# ---------------------------------------------------------------------------


class TestContentController:
    @pytest.mark.asyncio
    async def test_list_content_requires_auth(self, client, mock_db):
        resp = await client.get("/content")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_content_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/content", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        # Content endpoint returns paginated response with 'data' key
        data = resp.json()
        assert "data" in data or isinstance(data, list)

    @pytest.mark.asyncio
    async def test_create_content_requires_auth(self, client, mock_db):
        resp = await client.post("/content", json={"title": "Test"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_content_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/content/nonexistent123", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Audit controller
# ---------------------------------------------------------------------------


class TestAuditController:
    @pytest.mark.asyncio
    async def test_get_logs_by_user_requires_auth(self, client, mock_db):
        """GET /log/{user_id} requires auth."""
        resp = await client.get("/log/someuserid")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_logs_by_user_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get(f"/log/{teacher['_id']}", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_create_log_entries(self, client, mock_db):
        """POST /log accepts a JSON array."""
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.post("/log", json=[{
            "user": teacher["_id"],
            "logText": "test action",
            "time": "12:00",
            "priority": 1,
        }], headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Tenant dashboard and analytics
# ---------------------------------------------------------------------------


class TestTenantDashboard:
    @pytest.mark.asyncio
    async def test_dashboard_requires_tenant(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/tenant/dashboard", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_dashboard_success(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.get("/tenant/dashboard", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        data = resp.json()
        assert "statistics" in data

    @pytest.mark.asyncio
    async def test_change_password_success(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.post("/tenant/change-password", json={
            "newPassword": "newSecurePass123",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
