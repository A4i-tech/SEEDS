"""
Integration tests for backend Phase 1 — identity, users, school, classroom endpoints.

Uses mongomock-motor to avoid needing a real MongoDB instance.
Uses httpx.AsyncClient with the FastAPI app to test HTTP layer.

Coverage:
  - test_teacher_login_returns_token
  - test_teacher_login_wrong_password
  - test_teacher_register_success
  - test_teacher_register_duplicate
  - test_get_teacher_requires_auth
  - test_get_teacher_with_token
  - test_student_list_requires_teacher
  - test_user_participants_requires_auth (security fix verification)
  - test_create_school
  - test_list_classes_by_school
"""

from __future__ import annotations

import os

# Set minimal env vars before app imports resolve settings
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
from app.models.user import UserRole
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
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


async def _seed_teacher(mock_db, phone: str = "+911234567890", password: str = "Test@1234") -> dict:
    """Insert a teacher user and return its dict."""
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "Test Teacher",
        "email": phone,
        "phone": phone,
        "hashed_password": hash_password(password),
        "school_id": "school001",
        "tenant_id": "tenant001",
        "is_active": True,
    }
    result = await mock_db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def _seed_tenant(mock_db, email: str = "tenant@test.com", password: str = "TenantPass@1") -> dict:
    """Insert a tenant user and return its dict."""
    doc = {
        "role": UserRole.TENANT.value,
        "name": "Test Tenant",
        "email": email,
        "tenant_name": "Test Org",
        "hashed_password": hash_password(password),
        "is_active": True,
    }
    result = await mock_db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(user_id: str, school_id: str = "school001", tenant_id: str = "tenant001") -> str:
    return create_access_token({
        "sub": user_id,
        "role": "teacher",
        "school_id": school_id,
        "tenant_id": tenant_id,
    })


def _school_admin_token(school_id: str, tenant_id: str = "tenant001") -> str:
    return create_access_token({
        "sub": school_id,
        "role": "school_admin",
        "school_id": school_id,
        "tenant_id": tenant_id,
    })


def _tenant_token(user_id: str) -> str:
    return create_access_token({
        "sub": user_id,
        "role": "tenant",
        "tenant_id": user_id,
    })


# ---------------------------------------------------------------------------
# Tests: Teacher Auth
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_teacher_login_returns_token(client, mock_db):
    """POST /teacher/login with valid credentials returns token."""
    await _seed_teacher(mock_db, "+911234567890", "Test@1234")

    resp = await client.post(
        "/teacher/login",
        json={"phoneNumber": "+911234567890", "password": "Test@1234"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "token" in body


@pytest.mark.asyncio
async def test_teacher_login_wrong_password(client, mock_db):
    """POST /teacher/login with wrong password returns 401."""
    await _seed_teacher(mock_db, "+911234567891", "Test@1234")

    resp = await client.post(
        "/teacher/login",
        json={"phoneNumber": "+911234567891", "password": "WrongPass@1"},
    )
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_teacher_register_success(client, mock_db):
    """POST /teacher/register with valid school_admin token creates a new teacher."""
    token = _school_admin_token("school001")

    resp = await client.post(
        "/teacher/register",
        json={
            "phoneNumber": "+919876543210",
            "password": "NewTeacher@1",
            "name": "New Teacher",
            "role": "teacher",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "hashed_password" not in body
    assert body["name"] == "New Teacher"


@pytest.mark.asyncio
async def test_teacher_register_duplicate(client, mock_db):
    """POST /teacher/register with duplicate phone returns 409."""
    await _seed_teacher(mock_db, "+919999999991", "Test@1234")
    token = _school_admin_token("school001")

    # Register with same phone number
    resp = await client.post(
        "/teacher/register",
        json={
            "phoneNumber": "+919999999991",
            "password": "NewTeacher@1",
            "name": "Dup Teacher",
            "role": "teacher",
        },
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 409


@pytest.mark.asyncio
async def test_get_teacher_requires_auth(client):
    """GET /teacher/{id} without token returns 401."""
    resp = await client.get("/teacher/teachers")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_get_teacher_with_token(client, mock_db):
    """GET /teacher/me with valid token returns teacher profile."""
    teacher = await _seed_teacher(mock_db, "+919999999992", "Test@1234")
    token = _teacher_token(teacher["_id"])

    resp = await client.get(
        "/teacher/me",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert "hashed_password" not in body
    assert body["name"] == "Test Teacher"


# ---------------------------------------------------------------------------
# Tests: Student / Role enforcement
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_student_list_requires_teacher(client, mock_db):
    """GET /student with tenant token should return 403 (teacher role required)."""
    tenant = await _seed_tenant(mock_db)
    token = _tenant_token(tenant["_id"])

    resp = await client.get(
        "/student",
        headers={"Authorization": f"Bearer {token}"},
    )
    # tenant role should be forbidden on teacher-role endpoint
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_student_list_with_teacher_token(client, mock_db):
    """GET /student with valid teacher token returns list."""
    teacher = await _seed_teacher(mock_db, "+919999999993", "Test@1234")
    token = _teacher_token(teacher["_id"])

    resp = await client.get(
        "/student",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# Tests: Security Fix — /user/participants
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_participants_requires_auth(client):
    """GET /user/participants without token returns 401 (security fix)."""
    resp = await client.get("/user/participants")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_user_participants_with_teacher_token(client, mock_db):
    """GET /user/participants with valid teacher token returns list."""
    teacher = await _seed_teacher(mock_db, "+919999999994", "Test@1234")
    token = _teacher_token(teacher["_id"])

    resp = await client.get(
        "/user/participants",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


# ---------------------------------------------------------------------------
# Tests: School
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_school(client, mock_db):
    """POST /school with tenant token creates a school."""
    tenant = await _seed_tenant(mock_db)
    token = _tenant_token(tenant["_id"])

    resp = await client.post(
        "/school",
        json={"name": "Test School", "email": "school@test.com", "password": "School@Pass1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 201
    body = resp.json()
    assert "hashed_password" not in body
    assert body["name"] == "Test School"
    assert body["email"] == "school@test.com"


@pytest.mark.asyncio
async def test_create_school_requires_tenant(client, mock_db):
    """POST /school with teacher token returns 403."""
    teacher = await _seed_teacher(mock_db, "+919999999995", "Test@1234")
    token = _teacher_token(teacher["_id"])

    resp = await client.post(
        "/school",
        json={"name": "S", "email": "s@s.com", "password": "School@Pass1"},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_list_schools_with_tenant_token(client, mock_db):
    """GET /school with tenant token returns list."""
    tenant = await _seed_tenant(mock_db)
    token = _tenant_token(tenant["_id"])

    # Seed a school
    await mock_db["schools"].insert_one({
        "tenant_id": tenant["_id"],
        "name": "Seeded School",
        "email": "seeded@school.com",
        "is_active": True,
    })

    resp = await client.get(
        "/school",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)


# ---------------------------------------------------------------------------
# Tests: Classroom
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_list_classes_by_school(client, mock_db):
    """GET /class?school_id=xxx returns classes for that school."""
    teacher = await _seed_teacher(mock_db, "+919999999996", "Test@1234")
    token = _teacher_token(teacher["_id"])

    school_id = "testschool001"
    # Seed classrooms
    await mock_db["classes"].insert_one({
        "school_id": school_id,
        "name": "Class A",
        "teacher": teacher["_id"],
        "students": [],
        "leaders": [],
        "content_ids": [],
    })

    resp = await client.get(
        f"/class?school_id={school_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert isinstance(body, list)
    assert any(c["name"] == "Class A" for c in body)


@pytest.mark.asyncio
async def test_create_class(client, mock_db):
    """POST /class with valid teacher token creates a classroom."""
    teacher = await _seed_teacher(mock_db, "+919999999997", "Test@1234")
    token = _teacher_token(teacher["_id"])

    resp = await client.post(
        "/class",
        json={"name": "New Class", "students": [], "leaders": [], "contentIds": []},
        headers={"Authorization": f"Bearer {token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "New Class"


@pytest.mark.asyncio
async def test_list_classes_requires_auth(client):
    """GET /class without token returns 401."""
    resp = await client.get("/class")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_health_check(client):
    """GET /health returns 200 (always)."""
    resp = await client.get("/health")
    assert resp.status_code == 200
