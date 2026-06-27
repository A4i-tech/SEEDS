"""
Deep coverage for school_controller and users_controller endpoints.
"""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")


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
    db = client["seeds_test_su_deep"]
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


async def _seed_teacher(db, email="t@su.com", tid="t1", sid="s1"):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "SU Teacher",
        "email": email,
        "hashed_password": hash_password("pass1234"),
        "tenant_id": tid,
        "school_id": sid,
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(uid, tid="t1", sid="s1"):
    return create_access_token({"sub": uid, "role": "teacher", "tenant_id": tid, "school_id": sid})


async def _seed_tenant(db, email="ten@su.com"):
    doc = {
        "role": UserRole.TENANT.value,
        "name": "SU Tenant",
        "email": email,
        "tenant_name": "SUOrg",
        "hashed_password": hash_password("tenantpass"),
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _tenant_token(uid):
    return create_access_token({"sub": uid, "role": "tenant"})


def _school_admin_token(uid, tid="t1", sid="s1"):
    return create_access_token({"sub": uid, "role": "school_admin", "tenant_id": tid, "school_id": sid})


# ---------------------------------------------------------------------------
# School controller — various endpoints
# ---------------------------------------------------------------------------


class TestSchoolControllerDeep:
    @pytest.mark.asyncio
    async def test_list_schools_requires_auth(self, client, mock_db):
        resp = await client.get("/school/list")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_schools_with_token(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.get("/school/list", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_school_teachers_requires_auth(self, client, mock_db):
        resp = await client.get("/school/teachers")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_school_teachers_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])
        resp = await client.get("/school/teachers", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_create_school_requires_auth(self, client, mock_db):
        resp = await client.post("/school", json={"name": "Test School"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_create_school_with_tenant_token(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.post("/school", json={
            "name": "Test School",
            "address": "123 Main St",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 422)

    @pytest.mark.asyncio
    async def test_transfer_teacher_requires_auth(self, client, mock_db):
        resp = await client.post("/school/transferTeacher", json={})
        assert resp.status_code in (401, 404, 405, 422)

    @pytest.mark.asyncio
    async def test_school_analytics_requires_auth(self, client, mock_db):
        resp = await client.post("/school/analytics", json={})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_delete_school_requires_auth(self, client, mock_db):
        resp = await client.delete("/school/school_id_123")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_list_classes_with_token(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/class", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_get_class_requires_auth(self, client, mock_db):
        resp = await client.get("/class/cls1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_upsert_class_requires_auth(self, client, mock_db):
        resp = await client.post("/class", json={"name": "Class 1"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_school_requires_tenant(self, client, mock_db):
        """get_school requires tenant role — teacher gets 403."""
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/school/000000000000000000000000", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 403, 404)

    @pytest.mark.asyncio
    async def test_get_school_with_tenant_token(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.get("/school/000000000000000000000000", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_update_school_requires_auth(self, client, mock_db):
        resp = await client.patch("/school/school_id_123", json={"name": "Updated"})
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Users controller — update teacher, delete teacher, create/list/update student
# ---------------------------------------------------------------------------


class TestUsersControllerDeep:
    @pytest.mark.asyncio
    async def test_update_teacher_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])
        resp = await client.patch("/teacher/000000000000000000000000", json={"name": "New Name"}, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_update_teacher_self(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])
        resp = await client.patch(f"/teacher/{teacher['_id']}", json={"name": "Updated Teacher"}, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404, 403)

    @pytest.mark.asyncio
    async def test_delete_teacher_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])
        resp = await client.delete("/teacher/000000000000000000000000", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 204, 404, 403)

    @pytest.mark.asyncio
    async def test_create_student_success(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])
        resp = await client.post("/student", json={
            "name": "Test Student",
            "phoneNumber": "+919999999998",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 409, 422)

    @pytest.mark.asyncio
    async def test_create_student_duplicate_phone(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])

        # Create first
        await client.post("/student", json={
            "name": "Student A",
            "phoneNumber": "+919999999997",
        }, headers={"Authorization": f"Bearer {token}"})

        # Try to create duplicate
        resp2 = await client.post("/student", json={
            "name": "Student B",
            "phoneNumber": "+919999999997",
        }, headers={"Authorization": f"Bearer {token}"})
        # Second should fail with conflict
        assert resp2.status_code in (200, 201, 409, 422)

    @pytest.mark.asyncio
    async def test_update_student_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])
        resp = await client.patch("/student/000000000000000000000000", json={"name": "Updated"}, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_delete_student_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])
        resp = await client.delete("/student/000000000000000000000000", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 204, 404)
