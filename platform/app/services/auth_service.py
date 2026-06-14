"""
Auth service — login, register_teacher, register_tenant.

Ported from backend-server/src/auth/authenticateToken.js and teacher/tenant services.

SECURITY:
  - Plain-text passwords are never logged or returned.
  - auth.failures telemetry counter is incremented on every failure.
  - Passwords are hashed with bcrypt (via platform/auth/hashing.py).
"""

from __future__ import annotations

import logging
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import User, UserCreate, UserRole
from app.platform.auth.hashing import hash_password, verify_password
from app.platform.auth.jwt import create_access_token
from app.platform.error_handling import ConflictError, UnauthorizedError
from app.platform.telemetry import get_counter
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Public schema (no hashed_password)
# ---------------------------------------------------------------------------


def _user_public(user: User) -> dict[str, Any]:
    """Return a safe user dict that excludes hashed_password and firebase internals."""
    data = user.model_dump(by_alias=False, exclude_none=True)
    data.pop("hashed_password", None)
    data.pop("firebase_uid", None)
    return data


# ---------------------------------------------------------------------------
# TeacherCreate / TenantCreate input models (lightweight, no circular imports)
# ---------------------------------------------------------------------------


class TeacherCreate:
    """Minimal creation payload for a teacher user."""

    def __init__(
        self,
        name: str,
        email: str,
        password: str,
        tenant_id: str | None = None,
        school_id: str | None = None,
        phone: str | None = None,
        language_preference: str | None = None,
    ) -> None:
        self.name = name
        self.email = email
        self.password = password
        self.tenant_id = tenant_id
        self.school_id = school_id
        self.phone = phone
        self.language_preference = language_preference


class TenantCreate:
    """Minimal creation payload for a tenant user."""

    def __init__(
        self,
        name: str,
        email: str,
        password: str,
        tenant_name: str | None = None,
        organisation: str | None = None,
        phone: str | None = None,
    ) -> None:
        self.name = name
        self.email = email
        self.password = password
        self.tenant_name = tenant_name
        self.organisation = organisation
        self.phone = phone


# ---------------------------------------------------------------------------
# Login
# ---------------------------------------------------------------------------


async def login(
    email: str,
    password: str,
    auth_type: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any]:
    """
    Authenticate a user and return a JWT bearer token plus public user data.

    auth_type="native"  — look up by email, verify bcrypt password, issue JWT.
    auth_type="firebase" — verify firebase token (passed as *password* arg), find/create user.

    Raises UnauthorizedError on failure and increments auth.failures counter.
    SECURITY: plain password is never logged.
    """
    auth_failures = get_counter("auth.failures")
    repo = UserRepository(db)

    if auth_type == "firebase":
        from app.platform.auth.providers.firebase_provider import verify_firebase_token  # noqa: PLC0415

        try:
            firebase_payload = await verify_firebase_token(password)  # password = ID token
        except Exception as exc:
            logger.warning("auth: firebase token verification failed — %s", type(exc).__name__)
            auth_failures.add(1, {"reason": "firebase_invalid_token"})
            raise UnauthorizedError("Invalid Firebase token") from exc

        uid: str = firebase_payload["uid"]
        user = await repo.find_by_firebase_uid(uid)
        if user is None:
            # Auto-provision the user from Firebase claims
            user = await repo.create(
                UserCreate(
                    role=UserRole.TEACHER,
                    name=firebase_payload.get("email", uid),
                    email=firebase_payload.get("email"),
                    firebase_uid=uid,
                    tenant_id=firebase_payload.get("tenant_id") or None,
                )
            )

        token = create_access_token(
            {
                "sub": str(user.id),
                "role": user.role.value,
                "tenant_id": user.tenant_id,
                "school_id": user.school_id,
            }
        )
        return {
            "access_token": token,
            "token_type": "bearer",  # nosec B105 — OAuth2 literal, not a password
            "user": _user_public(user),
        }

    # --- native auth ---
    user = await repo.find_by_email(email)
    if user is None or not user.hashed_password:
        logger.warning("auth: login failed — email not found or no password set")
        auth_failures.add(1, {"reason": "user_not_found"})
        raise UnauthorizedError("Invalid email or password")

    if not verify_password(password, user.hashed_password):
        logger.warning("auth: login failed — wrong password for user %s", user.id)
        auth_failures.add(1, {"reason": "wrong_password"})
        raise UnauthorizedError("Invalid email or password")

    token = create_access_token(
        {
            "sub": str(user.id),
            "role": user.role.value,
            "tenant_id": user.tenant_id,
            "school_id": user.school_id,
        }
    )
    return {
        "access_token": token,
        "token_type": "bearer",  # nosec B105 — OAuth2 literal, not a password
        "user": _user_public(user),
    }


# ---------------------------------------------------------------------------
# Register teacher
# ---------------------------------------------------------------------------


async def register_teacher(
    data: TeacherCreate,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> User:
    """
    Register a new teacher user.

    Raises ConflictError if email is already taken.
    SECURITY: password is hashed before storage; plaintext is never retained.
    """
    repo = UserRepository(db)

    existing = await repo.find_by_email(data.email)
    if existing is not None:
        raise ConflictError(f"email {data.email}")

    hashed = hash_password(data.password)

    user = await repo.create(
        UserCreate(
            role=UserRole.TEACHER,
            name=data.name,
            email=data.email,
            hashed_password=hashed,
            tenant_id=data.tenant_id,
            school_id=data.school_id,
            phone=data.phone,
            language_preference=data.language_preference,
        )
    )
    return user


# ---------------------------------------------------------------------------
# Register tenant
# ---------------------------------------------------------------------------


async def register_tenant(
    data: TenantCreate,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> User:
    """
    Register a new tenant (admin) user.

    Raises ConflictError if email is already taken.
    """
    repo = UserRepository(db)

    existing = await repo.find_by_email(data.email)
    if existing is not None:
        raise ConflictError(f"email {data.email}")

    hashed = hash_password(data.password)

    user = await repo.create(
        UserCreate(
            role=UserRole.TENANT,
            name=data.name,
            email=data.email,
            hashed_password=hashed,
            tenant_name=data.tenant_name,
            organisation=data.organisation,
            phone=data.phone,
        )
    )
    return user
