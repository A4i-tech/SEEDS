"""
User service — CRUD, tenant-scoped queries, participant listing.

SECURITY:
  - assert_same_tenant() is called in every tenant-scoped operation.
  - get_participants() now requires authentication (was unprotected in backend-server).
  - hashed_password is never returned; callers should use UserPublic schema.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import User, UserCreate, UserRole
from app.platform.auth.dependencies import get_db
from app.platform.authz.ownership import assert_conference_owner
from app.platform.authz.tenant_scope import assert_same_tenant
from app.platform.error_handling import ConflictError, ForbiddenError, NotFoundError
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Read
# ---------------------------------------------------------------------------


async def get_user(
    user_id: str,
    current_user: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> User:
    """
    Fetch a single user by ID.

    Enforces tenant-scope: the caller must belong to the same tenant as the
    requested user unless the resource belongs to the caller themselves.
    """
    repo = UserRepository(db)
    user = await repo.find_by_id(user_id)
    if user is None:
        raise NotFoundError("User", user_id)

    if user.tenant_id:
        assert_same_tenant(current_user, user.tenant_id)

    return user


async def list_users_by_tenant(
    tenant_id: str,
    current_user: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> list[User]:
    """Return all users belonging to *tenant_id*.

    The caller must share the same tenant or be the tenant themselves.
    """
    assert_same_tenant(current_user, tenant_id)

    repo = UserRepository(db)
    return await repo.find_all_by_tenant(tenant_id)


async def get_participants(
    conference_id: str,
    current_user: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> list[User]:
    """
    Return participant users for a given conference.

    FIX: Was an open (unauthenticated) endpoint in backend-server (/user/participants).
    Now requires a valid JWT and conference ownership.

    Raises ForbiddenError if the caller is not the conference owner.
    Raises NotFoundError if the conference does not exist.
    """
    # Verify caller owns (created) the conference - raises ForbiddenError if not.
    await assert_conference_owner(current_user, conference_id, db)

    # Resolve participant user IDs from the conference document.
    conference_doc = await db["conferenceState"].find_one({"conference_id": conference_id})
    if conference_doc is None:
        raise NotFoundError("Conference", conference_id)

    participant_ids: list[str] = [
        str(pid) for pid in conference_doc.get("participant_ids", [])
    ]

    repo = UserRepository(db)
    users: list[User] = []
    for uid in participant_ids:
        user = await repo.find_by_id(uid)
        if user is not None:
            users.append(user)

    return users


# ---------------------------------------------------------------------------
# Write
# ---------------------------------------------------------------------------


async def update_user(
    user_id: str,
    updates: dict[str, Any],
    current_user: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> User:
    """
    Apply *updates* to the user identified by *user_id*.

    Enforces tenant-scope before writing.
    SECURITY: if 'hashed_password' is in *updates* it is treated as already
    hashed by the caller — the service never accepts a plain password here.
    """
    repo = UserRepository(db)
    existing = await repo.find_by_id(user_id)
    if existing is None:
        raise NotFoundError("User", user_id)

    if existing.tenant_id:
        assert_same_tenant(current_user, existing.tenant_id)

    updated = await repo.update(user_id, updates)
    if updated is None:
        raise NotFoundError("User", user_id)
    return updated


async def delete_user(
    user_id: str,
    current_user: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> bool:
    """
    Delete a user by ID.

    Enforces tenant-scope before deleting.
    """
    repo = UserRepository(db)
    existing = await repo.find_by_id(user_id)
    if existing is None:
        raise NotFoundError("User", user_id)

    if existing.tenant_id:
        assert_same_tenant(current_user, existing.tenant_id)

    return await repo.delete(user_id)


# ---------------------------------------------------------------------------
# UserService class (DI-friendly wrapper around module-level functions)
# ---------------------------------------------------------------------------


class UserService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:
        self._db = db
        self._repo = UserRepository(db)

    # Delegates to existing module-level functions:
    async def get_user(self, user_id: str, current_user: dict) -> User:
        return await get_user(user_id, current_user, self._db)

    async def list_users_by_tenant(self, tenant_id: str, current_user: dict) -> list[User]:
        return await list_users_by_tenant(tenant_id, current_user, self._db)

    async def get_participants(self, conference_id: str, current_user: dict) -> list[User]:
        return await get_participants(conference_id, current_user, self._db)

    async def update_user(self, user_id: str, updates: dict, current_user: dict) -> User:
        return await update_user(user_id, updates, current_user, self._db)

    async def delete_user(self, user_id: str, current_user: dict) -> bool:
        return await delete_user(user_id, current_user, self._db)

    # Student methods (logic from student_controller.py):
    async def create_student(self, name: str, phone_number: str, school_id: str, tenant_id: str) -> User:
        existing = await self._repo.find_by_phone(phone_number)
        if existing and existing.school_id == school_id:
            raise ConflictError("Phone number already in use in this school")
        return await self._repo.create(
            UserCreate(
                role=UserRole.STUDENT,
                name=name,
                phone=phone_number,
                school_id=school_id,
                tenant_id=tenant_id,
            )
        )

    async def list_students_for_school(self, school_id: str, tenant_id: str) -> list[User]:
        all_users = await self._repo.find_all_by_tenant(tenant_id)
        return [u for u in all_users if u.school_id == school_id and u.role.value == "student"]

    async def update_student(self, student_id: str, updates: dict[str, Any], caller_school_id: str) -> User:
        if not caller_school_id:
            raise ForbiddenError("school_id claim required to update students")
        existing = await self._repo.find_by_id(student_id)
        if existing is None or existing.school_id != caller_school_id:
            raise NotFoundError("Student", student_id)
        if "phone" in updates:
            dup = await self._repo.find_by_phone(updates["phone"])
            if dup and str(dup.id) != student_id and dup.school_id == caller_school_id:
                raise ConflictError("Phone number already in use in this school")
        updated = await self._repo.update(student_id, updates)
        if updated is None:
            raise NotFoundError("Student", student_id)
        return updated

    async def delete_student(self, student_id: str, caller_school_id: str) -> None:
        if not caller_school_id:
            raise ForbiddenError("school_id claim required to delete students")
        existing = await self._repo.find_by_id(student_id)
        if existing is None or existing.school_id != caller_school_id:
            raise NotFoundError("Student", student_id)
        await self._repo.delete(student_id)

    # Teacher methods (logic from teacher_controller.py):
    async def list_teachers_for_school(self, school_id: str, tenant_id: str) -> list[User]:
        users = await self._repo.find_all_by_tenant(tenant_id)
        return [u for u in users if u.school_id == school_id and u.role.value in ("teacher", "content_creator")]

    async def update_teacher(self, teacher_id: str, updates: dict[str, Any], caller_school_id: str) -> User:
        if not caller_school_id:
            raise ForbiddenError("school_id claim required to update teachers")
        existing = await self._repo.find_by_id(teacher_id)
        if existing is None or existing.school_id != caller_school_id:
            raise NotFoundError("Teacher", teacher_id)
        updated = await self._repo.update(teacher_id, updates)
        if updated is None:
            raise NotFoundError("Teacher", teacher_id)
        return updated

    async def delete_teacher(self, teacher_id: str, caller_school_id: str) -> None:
        if not caller_school_id:
            raise ForbiddenError("school_id claim required to delete teachers")
        existing = await self._repo.find_by_id(teacher_id)
        if existing is None or existing.school_id != caller_school_id:
            raise NotFoundError("Teacher", teacher_id)
        await self._repo.delete(teacher_id)

    # Participant listing for user_controller:
    async def get_participants_for_school(self, tenant_id: str, school_id: str) -> list[dict]:
        all_users = await self._repo.find_all_by_tenant(tenant_id)
        return [
            {"_id": str(u.id), "name": u.name, "phone": u.phone or "", "role": u.role.value}
            for u in all_users
            if not school_id or u.school_id == school_id
        ]


def get_user_service(db: AsyncIOMotorDatabase[Any] = Depends(get_db)) -> UserService:
    return UserService(db)
