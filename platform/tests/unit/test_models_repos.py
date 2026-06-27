"""Unit tests for domain models and repositories.

Uses mongomock-motor for all repository tests — no real MongoDB required.
"""
from __future__ import annotations

import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient
from pydantic import ValidationError

from app.models.user import User, UserCreate, UserRole
from app.repositories.conference_repository import ConferenceRepository
from app.repositories.content_repository import ContentRepository
from app.repositories.user_repository import UserRepository

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db():
    """Return an in-memory mongomock-motor database."""
    client = AsyncMongoMockClient()
    return client["test_seeds"]


@pytest.fixture
def user_repo(mock_db):
    return UserRepository(mock_db)


@pytest.fixture
def content_repo(mock_db):
    return ContentRepository(mock_db)


@pytest.fixture
def conference_repo(mock_db):
    return ConferenceRepository(mock_db)


# ---------------------------------------------------------------------------
# Model tests
# ---------------------------------------------------------------------------


def test_user_model_from_mongo():
    """from_mongo() must convert ObjectId fields to str."""
    oid = ObjectId()
    doc = {
        "_id": oid,
        "role": "teacher",
        "name": "Priya Sharma",
        "phone": "+919876543210",
        "tenant_id": str(ObjectId()),
        "is_active": True,
    }
    user = User.from_mongo(doc)
    assert isinstance(user.id, str)
    assert user.id == str(oid)
    assert user.role == UserRole.TEACHER


def test_user_model_role_validation():
    """role must be one of teacher | tenant | student | content_creator."""
    valid_roles = ["teacher", "tenant", "student", "content_creator"]
    for role in valid_roles:
        u = User(role=role, name="Test User")
        assert u.role == role

    with pytest.raises(ValidationError):
        User(role="admin", name="Bad Role")


def test_unified_user_has_firebase_uid_field():
    """firebase_uid must be Optional and default to None."""
    u = User(role="teacher", name="Arjun Mehta")
    assert u.firebase_uid is None

    u2 = User(role="teacher", name="Arjun Mehta", firebase_uid="firebase_abc123")
    assert u2.firebase_uid == "firebase_abc123"


def test_user_model_all_roles_accepted():
    """All valid roles create a User without error."""
    for role in ("teacher", "student", "tenant", "content_creator"):
        u = User(role=role, name="Test")
        assert u.name == "Test"


def test_user_create_model():
    """UserCreate captures all required fields."""
    uc = UserCreate(
        role="student",
        name="Lakshmi Devi",
        phone="+919000000001",
        school_id=str(ObjectId()),
        tenant_id=str(ObjectId()),
    )
    assert uc.role == UserRole.STUDENT
    assert uc.firebase_uid is None


# ---------------------------------------------------------------------------
# Repository tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_user_repository_find_by_email(user_repo):
    """find_by_email queries the correct field and returns a User."""
    email = "teacher@school.example"
    await user_repo._col.insert_one(
        {
            "email": email,
            "role": "teacher",
            "name": "Ravi Kumar",
            "is_active": True,
        }
    )
    found = await user_repo.find_by_email(email)
    assert found is not None
    assert found.email == email
    assert found.role == UserRole.TEACHER


@pytest.mark.asyncio
async def test_user_repository_find_by_email_not_found(user_repo):
    """find_by_email returns None when no match exists."""
    result = await user_repo.find_by_email("nobody@example.com")
    assert result is None


@pytest.mark.asyncio
async def test_user_repository_find_by_id(user_repo):
    """find_by_id returns User when ObjectId matches."""
    oid = ObjectId()
    await user_repo._col.insert_one(
        {
            "_id": oid,
            "role": "tenant",
            "name": "Tenancy Corp",
            "email": "corp@tenant.example",
            "is_active": True,
        }
    )
    found = await user_repo.find_by_id(str(oid))
    assert found is not None
    assert found.id == str(oid)
    assert found.role == UserRole.TENANT


@pytest.mark.asyncio
async def test_user_repository_find_by_id_not_found(user_repo):
    """find_by_id returns None for a non-existent id."""
    result = await user_repo.find_by_id(str(ObjectId()))
    assert result is None


@pytest.mark.asyncio
async def test_user_repository_create(user_repo):
    """create() inserts the user and returns a User with an _id."""
    uc = UserCreate(
        role="teacher",
        name="Sunita Rao",
        phone="+919988776655",
        tenant_id=str(ObjectId()),
    )
    created = await user_repo.create(uc)
    assert created.id is not None
    assert created.name == "Sunita Rao"
    assert created.role == UserRole.TEACHER


@pytest.mark.asyncio
async def test_user_repository_update(user_repo):
    """update() modifies the specified field."""
    oid = ObjectId()
    await user_repo._col.insert_one(
        {"_id": oid, "role": "teacher", "name": "Old Name", "is_active": True}
    )
    updated = await user_repo.update(str(oid), {"name": "New Name"})
    assert updated is not None
    assert updated.name == "New Name"


@pytest.mark.asyncio
async def test_user_repository_delete(user_repo):
    """delete() removes the document and returns True."""
    oid = ObjectId()
    await user_repo._col.insert_one(
        {"_id": oid, "role": "student", "name": "Delete Me", "is_active": True}
    )
    deleted = await user_repo.delete(str(oid))
    assert deleted is True
    assert await user_repo.find_by_id(str(oid)) is None


# ---------------------------------------------------------------------------
# Content repository tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_content_repository_find_by_tenant(content_repo):
    """find_by_tenant applies the tenant_id filter and skips deleted items."""
    tenant_id = str(ObjectId())
    other_tenant = str(ObjectId())

    await content_repo._col.insert_many(
        [
            {
                "_id": "content-1",
                "tenantId": tenant_id,
                "type": "story",
                "language": "en",
                "isDeleted": False,
                "creation_time": 100,
            },
            {
                "_id": "content-2",
                "tenantId": tenant_id,
                "type": "song",
                "language": "hi",
                "isDeleted": True,
                "creation_time": 200,
            },
            {
                "_id": "content-3",
                "tenantId": other_tenant,
                "type": "story",
                "language": "en",
                "isDeleted": False,
                "creation_time": 150,
            },
        ]
    )

    results = await content_repo.find_by_tenant(tenant_id)
    assert len(results) == 1
    assert results[0].id == "content-1"

    # Include deleted
    all_results = await content_repo.find_by_tenant(tenant_id, include_deleted=True)
    assert len(all_results) == 2


@pytest.mark.asyncio
async def test_content_repository_find_by_class(content_repo):
    """find_by_class returns only the requested content IDs."""
    await content_repo._col.insert_many(
        [
            {"_id": "c-a", "type": "story", "language": "en", "is_deleted": False},
            {"_id": "c-b", "type": "quiz", "language": "hi", "is_deleted": False},
            {"_id": "c-c", "type": "song", "language": "en", "is_deleted": False},
        ]
    )
    results = await content_repo.find_by_class(["c-a", "c-c"])
    ids = {r.id for r in results}
    assert ids == {"c-a", "c-c"}


# ---------------------------------------------------------------------------
# Conference repository tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_conference_repo_find_active(conference_repo):
    """find_active_by_teacher only returns is_running=True AND ended_at=None docs."""
    teacher_phone = "+919876500000"

    await conference_repo._col.insert_many(
        [
            {
                "_id": ObjectId(),
                "conference_id": "conf-active",
                "teacher_phone_number": teacher_phone,
                "is_running": True,
                "ended_at": None,
            },
            {
                "_id": ObjectId(),
                "conference_id": "conf-ended",
                "teacher_phone_number": teacher_phone,
                "is_running": False,
                "ended_at": "2026-06-01T10:00:00Z",
            },
        ]
    )

    active = await conference_repo.find_active_by_teacher(teacher_phone)
    assert active is not None
    assert active.conference_id == "conf-active"


@pytest.mark.asyncio
async def test_conference_repo_no_active(conference_repo):
    """find_active_by_teacher returns None when no active conference exists."""
    result = await conference_repo.find_active_by_teacher("+910000000000")
    assert result is None


@pytest.mark.asyncio
async def test_conference_repo_update_state(conference_repo):
    """update_state modifies the document and returns updated state."""
    await conference_repo._col.insert_one(
        {
            "_id": ObjectId(),
            "conference_id": "conf-xyz",
            "is_running": True,
            "ended_at": None,
            "teacher_phone_number": "+911111111111",
        }
    )
    updated = await conference_repo.update_state("conf-xyz", {"hold_detected": True})
    assert updated is not None
    assert updated.hold_detected is True
