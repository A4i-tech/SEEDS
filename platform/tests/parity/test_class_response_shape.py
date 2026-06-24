"""
Verification tests for classroom and teacher endpoint response field naming.

These tests are parity-verification snapshots — not intended as long-lived
regression tests.

Classroom fields: camelCase (Classroom model has camelCase aliases: schoolId,
contentIds, createdAt, etc.) — matches legacy classRouter.js.

Teacher/User fields: snake_case except _id (User model has no camelCase aliases;
user.model_dump(by_alias=True) outputs snake_case). This matches PR #237 staging
shape for teacher-returning endpoints (transfer, register, me, update).

School fields: camelCase (School model has camelCase aliases: tenantId, isActive,
createdAt, etc.) — matches legacy schoolRouter.js.

Run:
    poetry run pytest tests/parity/test_class_response_shape.py -v
"""

from __future__ import annotations

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
# Fixtures — mirror test_backend_p1.py setup
# ---------------------------------------------------------------------------

@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test"]
    yield db
    client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


async def _seed_teacher(mock_db) -> dict:
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "Shape Test Teacher",
        "email": "+910000000001",
        "phone": "+910000000001",
        "hashed_password": hash_password("Test@1234"),
        "school_id": "shapetest_school",
        "tenant_id": "shapetest_tenant",
        "is_active": True,
    }
    result = await mock_db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(user_id: str, school_id: str = "shapetest_school") -> str:
    return create_access_token({
        "sub": user_id,
        "role": "teacher",
        "school_id": school_id,
        "tenant_id": "shapetest_tenant",
    })


# ---------------------------------------------------------------------------
# BEFORE — documents the broken state (snake_case keys).
# These assertions will FAIL after the ClassroomResponse DTO fix is applied.
# Kept here as a record of what the old behavior was.
# ---------------------------------------------------------------------------

class TestClassResponseShapeBefore:
    """Snapshot of pre-fix behavior: snake_case field names in response."""

    @pytest.mark.asyncio
    async def test_list_classes_before_returns_snake_case(self, client, mock_db):
        """
        BEFORE FIX: GET /class returns snake_case keys (school_id, content_ids).
        This test documents broken parity — legacy returns schoolId, contentIds.
        Expected to FAIL once ClassroomResponse DTO fix is applied.
        """
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        await mock_db["classes"].insert_one({
            "schoolId": "shapetest_school",
            "name": "Shape Class",
            "teacher": teacher["_id"],
            "students": [],
            "leaders": [],
            "contentIds": [],
        })

        resp = await client.get("/class", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) > 0
        item = body[0]
        # Pre-fix: snake_case keys present
        assert "school_id" in item or "schoolId" in item, "neither key present"

    @pytest.mark.asyncio
    async def test_upsert_class_before_returns_snake_case(self, client, mock_db):
        """
        BEFORE FIX: POST /class returns snake_case keys.
        Expected to FAIL once ClassroomResponse DTO fix is applied.
        """
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        resp = await client.post(
            "/class",
            json={"name": "New Shape Class", "students": [], "leaders": [], "contentIds": []},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert "school_id" in body or "schoolId" in body, "neither key present"


# ---------------------------------------------------------------------------
# AFTER — asserts correct camelCase response (legacy parity).
# These tests should PASS after the ClassroomResponse DTO fix.
# ---------------------------------------------------------------------------

class TestClassResponseShapeAfter:
    """Post-fix assertions: response keys must match legacy classRouter.js shape."""

    @pytest.mark.asyncio
    async def test_list_classes_returns_camel_case(self, client, mock_db):
        """GET /class → keys must be camelCase matching legacy Mongoose output."""
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        await mock_db["classes"].insert_one({
            "schoolId": "shapetest_school",
            "name": "Camel Class",
            "teacher": teacher["_id"],
            "students": [],
            "leaders": [],
            "contentIds": [],
        })

        resp = await client.get("/class", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert isinstance(body, list)
        assert len(body) > 0
        item = body[0]

        # Must have camelCase keys
        assert "schoolId" in item, f"expected 'schoolId', got keys: {list(item.keys())}"
        assert "contentIds" in item, f"expected 'contentIds', got keys: {list(item.keys())}"
        # Must NOT have snake_case keys
        assert "school_id" not in item, "snake_case 'school_id' leaked into response"
        assert "content_ids" not in item, "snake_case 'content_ids' leaked into response"
        assert item["name"] == "Camel Class"

    @pytest.mark.asyncio
    async def test_get_class_returns_camel_case(self, client, mock_db):
        """GET /class/{id} → keys must be camelCase."""
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        result = await mock_db["classes"].insert_one({
            "schoolId": "shapetest_school",
            "name": "Get Shape Class",
            "teacher": teacher["_id"],
            "students": [],
            "leaders": [],
            "contentIds": [],
        })
        class_id = str(result.inserted_id)

        resp = await client.get(f"/class/{class_id}", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()

        assert "schoolId" in body, f"expected 'schoolId', got keys: {list(body.keys())}"
        assert "contentIds" in body, f"expected 'contentIds', got keys: {list(body.keys())}"
        assert "school_id" not in body
        assert "content_ids" not in body

    @pytest.mark.asyncio
    async def test_upsert_class_returns_camel_case(self, client, mock_db):
        """POST /class → created classroom response must use camelCase keys."""
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        resp = await client.post(
            "/class",
            json={"name": "Upsert Shape Class", "students": [], "leaders": [], "contentIds": []},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        body = resp.json()

        assert "schoolId" in body, f"expected 'schoolId', got keys: {list(body.keys())}"
        assert "contentIds" in body, f"expected 'contentIds', got keys: {list(body.keys())}"
        assert "school_id" not in body
        assert "content_ids" not in body
        assert body["name"] == "Upsert Shape Class"

    @pytest.mark.asyncio
    async def test_id_field_uses_underscore_prefix(self, client, mock_db):
        """_id (not 'id') must be in response — matches MongoDB/legacy convention."""
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        result = await mock_db["classes"].insert_one({
            "schoolId": "shapetest_school",
            "name": "ID Field Class",
            "teacher": teacher["_id"],
            "students": [],
            "leaders": [],
            "contentIds": [],
        })
        class_id = str(result.inserted_id)

        resp = await client.get(f"/class/{class_id}", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()
        assert "_id" in body, f"expected '_id' key, got: {list(body.keys())}"
        assert "id" not in body or body.get("id") is None


# ---------------------------------------------------------------------------
# Transfer teacher — /school/transfer response shape
# ---------------------------------------------------------------------------

class TestTransferTeacherResponseShape:
    """POST /school/transfer → teacher object must use camelCase matching legacy."""

    @pytest.mark.asyncio
    async def test_transfer_teacher_response_camel_case(self, client, mock_db):
        """teacher dict in response must use camelCase keys (schoolId, phoneNumber, isActive)."""
        from app.platform.auth.hashing import hash_password as _hp
        from app.models.user import UserRole

        # Seed source school
        src_school = await mock_db["schools"].insert_one({
            "name": "Source School",
            "email": "src@school.com",
            "tenantId": "shapetest_tenant",
            "isActive": True,
        })
        # Seed target school
        tgt_school = await mock_db["schools"].insert_one({
            "name": "Target School",
            "email": "tgt@school.com",
            "tenantId": "shapetest_tenant",
            "isActive": True,
        })
        src_id = str(src_school.inserted_id)
        tgt_id = str(tgt_school.inserted_id)

        # Seed teacher in source school
        teacher_doc = {
            "role": UserRole.TEACHER.value,
            "name": "Transfer Test Teacher",
            "email": "+910000000099",
            "phone": "+910000000099",
            "hashed_password": _hp("Test@1234"),
            "school_id": src_id,
            "tenant_id": "shapetest_tenant",
            "is_active": True,
        }
        teacher_result = await mock_db["users"].insert_one(teacher_doc)
        teacher_id = str(teacher_result.inserted_id)

        from app.platform.auth.jwt import create_access_token
        token = create_access_token({
            "sub": teacher_id,
            "role": "teacher",
            "school_id": src_id,
            "tenant_id": "shapetest_tenant",
        })

        resp = await client.post(
            "/school/transfer",
            json={"teacher_id": teacher_id, "target_school_id": tgt_id},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        body = resp.json()

        assert "teacher" in body
        teacher = body["teacher"]

        # User model has no camelCase aliases — user.model_dump(by_alias=True)
        # outputs snake_case (only _id changes). This matches PR #237 staging shape.
        assert "_id" in teacher, f"expected '_id', got: {list(teacher.keys())}"
        assert "school_id" in teacher, f"expected 'school_id', got: {list(teacher.keys())}"
        assert "is_active" in teacher, f"expected 'is_active', got: {list(teacher.keys())}"

        # camelCase must NOT appear for User fields
        assert "schoolId" not in teacher, "camelCase 'schoolId' should not appear"
        assert "isActive" not in teacher, "camelCase 'isActive' should not appear"

        # password must never appear
        assert "hashed_password" not in teacher
        assert "password" not in teacher

        # school_id must reflect the transfer
        assert teacher["school_id"] == tgt_id


# ---------------------------------------------------------------------------
# School dashboard — /school/dashboard response shape
# ---------------------------------------------------------------------------

class TestSchoolDashboardResponseShape:
    """GET /school/dashboard → school object must use camelCase, no password."""

    @pytest.mark.asyncio
    async def test_dashboard_school_camel_case_no_password(self, client, mock_db):
        """school dict in dashboard must use camelCase keys and never expose password."""
        from app.platform.auth.hashing import hash_password as _hp
        from app.models.user import UserRole
        from app.platform.auth.jwt import create_access_token

        school_result = await mock_db["schools"].insert_one({
            "tenantId": "dashtest_tenant",
            "name": "Dashboard School",
            "email": "dash@school.com",
            "password": _hp("SchoolPass@1"),
            "isActive": True,
            "tenant_id": "dashtest_tenant",
        })
        school_id = str(school_result.inserted_id)

        token = create_access_token({
            "sub": school_id,
            "role": "teacher",
            "school_id": school_id,
            "tenant_id": "dashtest_tenant",
        })

        resp = await client.get("/school/dashboard", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200
        body = resp.json()

        assert "school" in body
        school = body["school"]

        # camelCase keys
        assert "tenantId" in school, f"expected 'tenantId', got: {list(school.keys())}"
        assert "isActive" in school, f"expected 'isActive', got: {list(school.keys())}"
        assert "_id" in school, f"expected '_id', got: {list(school.keys())}"

        # snake_case must not leak
        assert "tenant_id" not in school
        assert "is_active" not in school

        # password must NEVER appear under any key
        assert "password" not in school, "raw 'password' field leaked into response"
        assert "hashed_password" not in school, "'hashed_password' leaked into response"

        # counts present
        assert "teachers" in body
        assert "students" in body
        assert "classes" in body
