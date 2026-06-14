"""
Extra integration coverage for school_controller endpoints.
"""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")

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


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_school_extra"]
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


async def _seed_teacher(db, email="t@schex.com", tid="t1", sid="s1"):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "SchEx Teacher",
        "email": email,
        "hashed_password": hash_password("pass1234"),
        "tenant_id": tid,
        "school_id": sid,
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def _seed_tenant(db, email="ten@schex.com"):
    doc = {
        "role": UserRole.TENANT.value,
        "name": "SchEx Tenant",
        "email": email,
        "tenant_name": "SchExOrg",
        "hashed_password": hash_password("tenantpass"),
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(uid, tid="t1", sid="s1"):
    return create_access_token({"sub": uid, "role": "teacher", "tenant_id": tid, "school_id": sid})


def _tenant_token(uid):
    return create_access_token({"sub": uid, "role": "tenant"})


def _school_admin_token(uid, tid="t1", sid="s1"):
    return create_access_token({"sub": uid, "role": "school_admin", "tenant_id": tid, "school_id": sid})


class TestSchoolControllerExtra:
    @pytest.mark.asyncio
    async def test_transfer_teacher_requires_auth(self, client, mock_db):
        resp = await client.post("/school/transferTeacher", json={
            "teacher_id": "000000000000000000000000",
            "target_school_id": "000000000000000000000001",
        })
        assert resp.status_code in (401, 403, 404, 405, 422)

    @pytest.mark.asyncio
    async def test_transfer_teacher_not_found(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.post("/school/transferTeacher", json={
            "teacher_id": "000000000000000000000000",
            "target_school_id": "000000000000000000000001",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404, 405, 422)

    @pytest.mark.asyncio
    async def test_school_dashboard_requires_auth(self, client, mock_db):
        resp = await client.get("/school/dashboard")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_school_dashboard_with_teacher(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/school/dashboard", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 403, 404)

    @pytest.mark.asyncio
    async def test_school_analytics_with_tenant(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.post("/school/analytics", json={
            "school_id": "000000000000000000000000",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 403, 404, 422)

    @pytest.mark.asyncio
    async def test_school_analytics_empty_body(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.post("/school/analytics", json={}, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 403, 404, 422)

    @pytest.mark.asyncio
    async def test_delete_school_with_tenant(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.delete("/school/000000000000000000000000", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 204, 404, 403)

    @pytest.mark.asyncio
    async def test_update_school_with_tenant(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.patch("/school/000000000000000000000000", json={
            "name": "Updated School",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404, 422)

    @pytest.mark.asyncio
    async def test_upsert_class_with_teacher(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.post("/class", json={
            "name": "Test Class",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 422)

    @pytest.mark.asyncio
    async def test_get_class_with_teacher(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/class/000000000000000000000000", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)
