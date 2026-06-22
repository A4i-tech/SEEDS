"""
Auth service — login, register_teacher, register_tenant, school_admin_login, profiles.

Ported from backend-server/src/auth/authenticateToken.js and teacher/tenant services.

SECURITY:
  - Plain-text passwords are never logged or returned.
  - auth.failures telemetry counter is incremented on every failure.
  - Passwords are hashed with bcrypt (via platform/auth/hashing.py).
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.user import User, UserCreate, UserRole
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password, verify_password
from app.platform.auth.jwt import create_access_token
from app.platform.error_handling import ConflictError, NotFoundError, UnauthorizedError
from app.platform.telemetry import get_counter
from app.repositories.classroom_repository import ClassroomRepository
from app.repositories.school_repository import SchoolRepository
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
        from app.platform.auth.providers.firebase_provider import (
            verify_firebase_token,  # noqa: PLC0415
        )

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
            "token": token,
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
        "token": token,
        "user": _user_public(user),
    }


# ---------------------------------------------------------------------------
# Phone-based login (teachers identify by phone, not email)
# ---------------------------------------------------------------------------


async def login_by_phone(
    phone: str,
    password: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Authenticate a teacher by phone number and return a JWT + public user data.

    Teachers have no email in the legacy schema — they are looked up by phone.
    SECURITY: plain password is never logged.
    """
    auth_failures = get_counter("auth.failures")
    repo = UserRepository(db)

    user = await repo.find_by_phone(phone)
    if user is None or not user.hashed_password:
        logger.warning("auth: teacher login failed — phone not found or no password set")
        auth_failures.add(1, {"reason": "user_not_found"})
        raise UnauthorizedError("Invalid phone or password")

    if not verify_password(password, user.hashed_password):
        logger.warning("auth: teacher login failed — wrong password for user %s", user.id)
        auth_failures.add(1, {"reason": "wrong_password"})
        raise UnauthorizedError("Invalid phone or password")

    token = create_access_token(
        {
            "sub": str(user.id),
            "role": user.role.value,
            "tenant_id": user.tenant_id,
            "school_id": user.school_id,
        }
    )
    return {
        "token": token,
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


# ---------------------------------------------------------------------------
# School admin login
# ---------------------------------------------------------------------------


async def school_admin_login(
    email: str,
    password: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Authenticate a school admin against the schools collection.

    School admins are NOT in the users collection — they are schools documents
    with a bcrypt-hashed password field. Issues a JWT with role=school_admin.

    SECURITY: plain password is never logged.
    """
    auth_failures = get_counter("auth.failures")
    repo = SchoolRepository(db)

    school = await repo.find_by_email(email)
    if school is None or not school.hashed_password:
        logger.warning("auth: school_admin login failed — email not found or no password")
        auth_failures.add(1, {"reason": "school_not_found"})
        raise UnauthorizedError("Invalid credentials")

    if not school.is_active:
        logger.warning("auth: school_admin login failed — inactive account %s", school.id)
        auth_failures.add(1, {"reason": "inactive_account"})
        raise UnauthorizedError("Account is inactive")

    if not verify_password(password, school.hashed_password):
        logger.warning("auth: school_admin login failed — wrong password for school %s", school.id)
        auth_failures.add(1, {"reason": "wrong_password"})
        raise UnauthorizedError("Invalid credentials")

    school_id = str(school.id)
    token = create_access_token(
        {
            "sub": school_id,
            "role": "school_admin",
            "school_id": school_id,
            "tenant_id": school.tenant_id,
        }
    )
    return {"token": token}


# ---------------------------------------------------------------------------
# Profile helpers
# ---------------------------------------------------------------------------


async def get_user_profile(
    user_id: str,
    entity_label: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> User:
    """Fetch a user document by ID; raise NotFoundError if absent."""
    user = await UserRepository(db).find_by_id(user_id)
    if user is None:
        raise NotFoundError(entity_label, user_id)
    return user


async def change_password(
    user_id: str,
    new_password: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> None:
    """Hash *new_password* and persist it for *user_id*. Raises NotFoundError if absent."""
    repo = UserRepository(db)
    if await repo.find_by_id(user_id) is None:
        raise NotFoundError("User", user_id)
    await repo.update(user_id, {"hashed_password": hash_password(new_password)})


async def get_school_admin_profile(
    school_id: str,
    tenant_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return the school document for a school admin (parity with backend-server getMe).

    Excludes hashed_password from the response.
    """
    school = await SchoolRepository(db).find_by_id(school_id)
    if school is None or school.tenant_id != tenant_id:
        raise NotFoundError("School", school_id)
    data = school.model_dump(by_alias=False, exclude_none=True)
    data.pop("hashed_password", None)
    return data


async def get_tenant_names(
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> list[str]:
    """Return a list of all tenant names (public endpoint)."""
    cursor = db["users"].find({"role": UserRole.TENANT.value}, {"tenant_name": 1, "name": 1})
    docs = await cursor.to_list(length=None)
    return [d.get("tenant_name") or d.get("name", "") for d in docs]


async def get_tenant_dashboard(
    tenant_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return aggregated dashboard statistics for a tenant."""
    schools = await SchoolRepository(db).find_all_by_tenant(tenant_id)
    all_users = await UserRepository(db).find_all_by_tenant(tenant_id)
    teacher_count = sum(1 for u in all_users if u.role == UserRole.TEACHER)
    student_count = sum(1 for u in all_users if u.role == UserRole.STUDENT)

    class_count = 0
    classroom_repo = ClassroomRepository(db)
    for school in schools:
        classes = await classroom_repo.find_by_school(str(school.id))
        class_count += len(classes)

    return {
        "statistics": {
            "totalSchools": len(schools),
            "totalTeachers": teacher_count,
            "totalStudents": student_count,
            "totalClasses": class_count,
        },
        "schools": [s.model_dump(by_alias=False, exclude_none=True) for s in schools],
    }


# ---------------------------------------------------------------------------
# AuthService class — thin OO wrapper around the module-level functions above
# ---------------------------------------------------------------------------


class AuthService:
    """Stateful wrapper around auth module-level functions, bound to a single DB session.

    Intended for use with FastAPI's dependency injection via ``get_auth_service``.
    All module-level functions are preserved for backward compatibility.
    """

    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:
        self._db = db

    async def login(self, email: str, password: str, auth_type: str) -> dict:
        return await login(email, password, auth_type, self._db)

    async def login_by_phone(self, phone: str, password: str) -> dict:
        return await login_by_phone(phone, password, self._db)

    async def register_teacher(self, data: TeacherCreate) -> User:
        return await register_teacher(data, self._db)

    async def register_tenant(self, data: TenantCreate) -> User:
        return await register_tenant(data, self._db)

    async def school_admin_login(self, email: str, password: str) -> dict:
        return await school_admin_login(email, password, self._db)

    async def get_user_profile(self, user_id: str, entity_label: str) -> User:
        return await get_user_profile(user_id, entity_label, self._db)

    async def change_password(self, user_id: str, new_password: str) -> None:
        return await change_password(user_id, new_password, self._db)

    async def get_school_admin_profile(self, school_id: str, tenant_id: str) -> dict:
        return await get_school_admin_profile(school_id, tenant_id, self._db)

    async def get_tenant_names(self) -> list:
        return await get_tenant_names(self._db)

    async def get_tenant_dashboard(self, tenant_id: str) -> dict:
        return await get_tenant_dashboard(tenant_id, self._db)


def get_auth_service(db: AsyncIOMotorDatabase[Any] = Depends(get_db)) -> AuthService:
    return AuthService(db)
