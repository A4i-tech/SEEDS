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

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import User
from app.platform.authz.audit import log_denial
from app.platform.authz.ownership import assert_conference_owner
from app.platform.authz.tenant_scope import assert_same_tenant
from app.platform.error_handling import NotFoundError
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
    conference_doc = await db["conference_states"].find_one({"conference_id": conference_id})
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
