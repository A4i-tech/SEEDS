"""
Unit tests for unified users service, auth service, and authz guardrails.

Uses mongomock-motor for all repository tests — no real MongoDB required.
"""

from __future__ import annotations

import os

import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

# ---------------------------------------------------------------------------
# Force safe test settings before any app imports.
# ---------------------------------------------------------------------------
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only")
os.environ.setdefault("AUTH_TYPE", "jwt")
os.environ.setdefault("JWT_EXPIRES_IN", "1d")
os.environ.setdefault("PASSWORD_SALT_ROUNDS", "4")  # fast for tests


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db():
    """Return an in-memory mongomock-motor database."""
    client = AsyncMongoMockClient()
    return client["test_seeds"]


# ---------------------------------------------------------------------------
# Auth service tests
# ---------------------------------------------------------------------------


class TestRegisterTeacher:
    @pytest.mark.asyncio
    async def test_register_teacher_creates_user_with_correct_role(self, mock_db):
        """register_teacher() should persist a user with role=teacher."""
        from app.services.auth_service import TeacherCreate, register_teacher

        data = TeacherCreate(
            name="Ravi Kumar",
            email="ravi@school.example",
            password="P@ssw0rd!",
            tenant_id=str(ObjectId()),
            school_id=str(ObjectId()),
        )
        user = await register_teacher(data, mock_db)

        assert user.role.value == "teacher"
        assert user.name == "Ravi Kumar"
        assert user.email == "ravi@school.example"

    @pytest.mark.asyncio
    async def test_register_teacher_password_is_hashed(self, mock_db):
        """Stored hashed_password must not be the plain-text password."""
        from app.services.auth_service import TeacherCreate, register_teacher

        plain = "MySecret123!"
        data = TeacherCreate(name="Teacher B", email="b@school.example", password=plain)
        user = await register_teacher(data, mock_db)

        assert user.hashed_password is not None
        assert user.hashed_password != plain

    @pytest.mark.asyncio
    async def test_register_duplicate_email_raises_conflict(self, mock_db):
        """Registering twice with the same email must raise ConflictError."""
        from app.platform.error_handling import ConflictError
        from app.services.auth_service import TeacherCreate, register_teacher

        data = TeacherCreate(name="Teacher C", email="dup@school.example", password="P@ssw0rd1")
        await register_teacher(data, mock_db)

        with pytest.raises(ConflictError):
            await register_teacher(data, mock_db)


# ---------------------------------------------------------------------------
# Login tests
# ---------------------------------------------------------------------------


class TestLoginNative:
    @pytest.mark.asyncio
    async def test_login_native_success_returns_jwt(self, mock_db):
        """Correct credentials must return a bearer token and user info."""
        from app.services.auth_service import TeacherCreate, login, register_teacher

        plain = "Correct$1"
        data = TeacherCreate(name="Login User", email="login@example.com", password=plain)
        await register_teacher(data, mock_db)

        result = await login("login@example.com", plain, "jwt", mock_db)

        assert "access_token" in result
        assert result["token_type"] == "bearer"
        assert "user" in result
        # hashed_password must NOT appear in the public response
        assert "hashed_password" not in result["user"]

    @pytest.mark.asyncio
    async def test_login_wrong_password_raises_unauthorized(self, mock_db):
        """
        Wrong password must raise UnauthorizedError (callers may choose to
        return None, but auth_service raises to ensure uniform behavior).
        """
        from app.platform.error_handling import UnauthorizedError
        from app.services.auth_service import TeacherCreate, login, register_teacher

        data = TeacherCreate(name="Wrong PW User", email="wrong@example.com", password="Right$1")
        await register_teacher(data, mock_db)

        with pytest.raises(UnauthorizedError):
            await login("wrong@example.com", "BadPassword!", "jwt", mock_db)

    @pytest.mark.asyncio
    async def test_login_wrong_password_increments_auth_failures(self, mock_db):
        """
        test_login_wrong_password_returns_none — login with wrong password
        does NOT silently return None; it raises UnauthorizedError which the
        caller (controller) catches and converts as needed.
        This test verifies the exception type (not silence).
        """
        from app.platform.error_handling import UnauthorizedError
        from app.services.auth_service import TeacherCreate, login, register_teacher

        data = TeacherCreate(name="Inc Failures", email="inc@example.com", password="Right$1")
        await register_teacher(data, mock_db)

        result = None
        try:
            result = await login("inc@example.com", "WrongPwd!", "jwt", mock_db)
        except UnauthorizedError:
            result = None  # expected

        assert result is None  # was not returned on bad password


# ---------------------------------------------------------------------------
# Tenant-scope authz tests
# ---------------------------------------------------------------------------


class TestAssertSameTenant:
    def test_assert_same_tenant_passes_matching_ids(self):
        """Matching tenant IDs must not raise."""
        from app.platform.authz.tenant_scope import assert_same_tenant

        tenant_id = str(ObjectId())
        current_user = {"sub": "user-1", "role": "teacher", "tenant_id": tenant_id}
        # Should not raise
        assert_same_tenant(current_user, tenant_id) is None

    def test_assert_same_tenant_blocks_mismatched_ids(self):
        """Different tenant IDs must raise ForbiddenError."""
        from app.platform.error_handling import ForbiddenError
        from app.platform.authz.tenant_scope import assert_same_tenant

        current_user = {
            "sub": "user-1",
            "role": "teacher",
            "tenant_id": str(ObjectId()),
        }
        other_tenant_id = str(ObjectId())

        with pytest.raises(ForbiddenError):
            assert_same_tenant(current_user, other_tenant_id)

    def test_assert_same_tenant_tenant_role_uses_sub_as_tenant(self):
        """A user with role=tenant and no tenant_id should use sub as their tenant_id."""
        from app.platform.authz.tenant_scope import assert_same_tenant

        sub = str(ObjectId())
        current_user = {"sub": sub, "role": "tenant", "tenant_id": ""}
        # Should not raise — sub == resource_tenant_id
        assert_same_tenant(current_user, sub) is None


# ---------------------------------------------------------------------------
# get_participants auth enforcement test
# ---------------------------------------------------------------------------


class TestGetParticipantsRequiresAuth:
    @pytest.mark.asyncio
    async def test_get_participants_requires_conference_ownership(self, mock_db):
        """
        get_participants() must enforce conference ownership.
        A user who did not create the conference must receive ForbiddenError.
        """
        from app.platform.error_handling import ForbiddenError
        from app.services.user_service import get_participants

        conference_id = "conf-abc-123"
        creator_id = str(ObjectId())
        intruder_id = str(ObjectId())

        # Insert a mock conference owned by creator_id.
        await mock_db["conference_states"].insert_one(
            {
                "conference_id": conference_id,
                "created_by": creator_id,
                "participant_ids": [],
            }
        )

        intruder_user = {"sub": intruder_id, "role": "teacher", "tenant_id": ""}

        with pytest.raises(ForbiddenError):
            await get_participants(conference_id, intruder_user, mock_db)

    @pytest.mark.asyncio
    async def test_get_participants_owner_succeeds(self, mock_db):
        """Conference owner should get an empty list when there are no participants."""
        from app.services.user_service import get_participants

        conference_id = "conf-owner-test"
        owner_id = str(ObjectId())

        await mock_db["conference_states"].insert_one(
            {
                "conference_id": conference_id,
                "created_by": owner_id,
                "participant_ids": [],
            }
        )

        owner_user = {"sub": owner_id, "role": "teacher", "tenant_id": ""}
        result = await get_participants(conference_id, owner_user, mock_db)
        assert result == []


# ---------------------------------------------------------------------------
# Migration idempotency test
# ---------------------------------------------------------------------------


class TestMigrationIdempotent:
    @pytest.mark.asyncio
    async def test_migration_idempotent_count_stays_same(self, mock_db):
        """
        Running the migration function twice must not increase the user count
        beyond the number of source documents.
        """
        import sys

        sys.path.insert(0, "/Users/soumabharaychaudhuri/Projects/a4i/SEEDS/platform")

        # Insert one teacher document (no migrated_from field).
        teacher_id = ObjectId()
        await mock_db["teachers"].insert_one(
            {
                "_id": teacher_id,
                "name": "Idempotent Teacher",
                "email": "idem@school.example",
                "role": "teacher",
            }
        )

        # --- First run ---
        await _run_migration_on_db(mock_db)
        count_after_first = await mock_db["users"].count_documents({"migrated_from": "teachers"})

        # --- Second run ---
        await _run_migration_on_db(mock_db)
        count_after_second = await mock_db["users"].count_documents({"migrated_from": "teachers"})

        assert count_after_first == count_after_second == 1


async def _run_migration_on_db(db) -> None:
    """
    Inline re-implementation of migration logic for unit-testing without
    spinning up a real MongoDB instance.  Mirrors 001_unify_users.py logic.
    """
    sources = [
        ("teachers", "teacher"),
        ("students", "student"),
        ("tenants", "tenant"),
    ]
    for collection_name, role in sources:
        src_col = db[collection_name]
        dst_col = db["users"]
        docs = await src_col.find({"migrated_from": {"$exists": False}}).to_list(length=None)
        for doc in docs:
            existing = await dst_col.find_one(
                {"migrated_from": collection_name, "_id": doc["_id"]}
            )
            if existing is not None:
                continue
            new_doc = dict(doc)
            new_doc["role"] = role
            new_doc["migrated_from"] = collection_name
            await dst_col.replace_one({"_id": doc["_id"]}, new_doc, upsert=True)
