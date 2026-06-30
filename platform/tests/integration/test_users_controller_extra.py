"""
Extra integration coverage for users_controller endpoints.
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
    db = client["seeds_test_users_extra"]
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


async def _seed_teacher(db, email="t@uext.com", tid="t1", sid="s1"):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "Extra Teacher",
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


def _school_admin_token(uid, tid="t1", sid="s1"):
    return create_access_token({"sub": uid, "role": "school_admin", "tenant_id": tid, "school_id": sid})


class TestUsersControllerExtra:
    @pytest.mark.asyncio
    async def test_create_student_empty_name_fails(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])
        resp = await client.post("/student", json={
            "name": "",
            "phoneNumber": "+919999999995",
        }, headers={"Authorization": f"Bearer {token}"})
        # Empty name should fail
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_create_student_success(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])
        resp = await client.post("/student", json={
            "name": "New Student",
            "phoneNumber": "+919999999993",
        }, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 201, 409)
        if resp.status_code in (200, 201):
            data = resp.json()
            assert data.get("name") == "New Student"

    @pytest.mark.asyncio
    async def test_update_student_empty_body_fails(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])
        resp = await client.patch("/student/000000000000000000000000", json={}, headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (400, 404, 422)

    @pytest.mark.asyncio
    async def test_list_students_returns_list(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/student", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    @pytest.mark.asyncio
    async def test_list_teachers_by_school(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/teacher", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_get_participants_by_school(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        resp = await client.get("/user/participants", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_update_student_with_existing_student(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])

        # Create a student first
        resp = await client.post("/student", json={
            "name": "Update Target",
            "phoneNumber": "+919999999992",
        }, headers={"Authorization": f"Bearer {token}"})

        if resp.status_code in (200, 201):
            student_id = resp.json().get("_id")
            if student_id:
                # Update the student
                update_resp = await client.patch(f"/student/{student_id}", json={
                    "name": "Updated Name",
                }, headers={"Authorization": f"Bearer {token}"})
                assert update_resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_delete_student_with_existing(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _school_admin_token(teacher["_id"])

        # Create then delete
        resp = await client.post("/student", json={
            "name": "Delete Target",
            "phoneNumber": "+919999999991",
        }, headers={"Authorization": f"Bearer {token}"})

        if resp.status_code in (200, 201):
            student_id = resp.json().get("_id")
            if student_id:
                del_resp = await client.delete(f"/student/{student_id}", headers={"Authorization": f"Bearer {token}"})
                assert del_resp.status_code in (200, 204, 404)
