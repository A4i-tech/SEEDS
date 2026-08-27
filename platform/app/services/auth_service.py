"""
Auth service — login_unified, login_by_phone, register_teacher, register_tenant, profiles.

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
from pymongo.asynchronous.database import AsyncDatabase

from app.models.refresh_token import UserClaims
from app.models.responses.dashboard import (
    DashboardStatistics,
    SchoolDashboardRow,
    TenantDashboardResponse,
)
from app.models.responses.school_response import SchoolResponse
from app.models.responses.user import UserPublicResponse
from app.models.user import User, UserCreate, UserRole
from app.platform.auth import refresh_tokens
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password, verify_password
from app.platform.auth.jwt import _parse_expires_delta, create_access_token
from app.platform.auth.refresh_tokens import TokenPair
from app.platform.error_handling import AppError, ConflictError, NotFoundError, UnauthorizedError
from app.platform.settings import get_settings
from app.platform.telemetry import get_counter
from app.repositories.classroom_repository import ClassroomRepository
from app.repositories.user_refresh_token_repository import UserRefreshTokenRepository
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


async def _issue_token_pair(
    *,
    sub: str,
    role: str,
    tenant_id: str,
    school_id: str | None,
    db: AsyncDatabase,
) -> TokenPair:
    settings = get_settings()
    access_token = create_access_token(
        {"sub": sub, "role": role, "tenant_id": tenant_id, "school_id": school_id}
    )
    expires_in = int(_parse_expires_delta(settings.jwt_expires_in).total_seconds())
    claims: UserClaims = {"role": role, "tenant_id": tenant_id, "school_id": school_id}
    return await refresh_tokens.issue_pair(
        UserRefreshTokenRepository(db),
        owner_id=sub,
        claims=claims,
        access_token=access_token,
        access_expires_in=expires_in,
        refresh_ttl=settings.refresh_token_expires_in,
    )


# ---------------------------------------------------------------------------
# Public schema (no hashed_password)
# ---------------------------------------------------------------------------


def _user_public(user: User) -> dict[str, Any]:
    """Return a safe user dict — snake_case, no password or firebase internals."""
    return UserPublicResponse.from_domain(user).to_response()


# ---------------------------------------------------------------------------
# TeacherCreate / TenantCreate input models (lightweight, no circular imports)
# ---------------------------------------------------------------------------


class TeacherCreate:
    """Minimal creation payload for a teacher or content_creator user."""

    def __init__(
        self,
        name: str,
        email: str,
        password: str,
        role: str = "teacher",
        tenant_id: str | None = None,
        school_id: str | None = None,
        phone: str | None = None,
        language_preference: str | None = None,
    ) -> None:
        self.name = name
        self.email = email
        self.password = password
        self.role = role
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


async def login_unified(
    identifier: str,
    password: str,
    is_email: bool,
    db: AsyncDatabase,
) -> dict[str, Any]:
    """Authenticate a ContentWebApp user (tenant/school_admin by email, content_creator by phone).

    Raises UnauthorizedError on failure and increments auth.failures counter.
    SECURITY: plain password is never logged.
    """
    auth_failures = get_counter("auth.failures")
    repo = UserRepository(db)

    if is_email:
        user = await repo.find_by_email(identifier)
        allowed_roles = (UserRole.TENANT, UserRole.SCHOOL_ADMIN)
    else:
        user = await repo.find_by_phone(identifier)
        allowed_roles = (UserRole.CONTENT_CREATOR,)

    if user is None or user.role not in allowed_roles or not user.hashed_password:
        logger.warning("auth: login failed — user not found or wrong role")
        auth_failures.add(1, {"reason": "user_not_found"})
        raise UnauthorizedError("Invalid credentials")

    if not user.is_active:
        logger.warning("auth: login failed — inactive account %s", user.id)
        auth_failures.add(1, {"reason": "inactive_account"})
        raise UnauthorizedError("Account is inactive")

    if not verify_password(password, user.hashed_password):
        logger.warning("auth: login failed — wrong password for user %s", user.id)
        auth_failures.add(1, {"reason": "wrong_password"})
        raise UnauthorizedError("Invalid credentials")

    # Tenant users are the root of their own tenant scope — their _id IS the
    # tenantId used in content/school documents, but tenant_id is not stored on
    # their own user record (they don't reference themselves). Use sub as tenant_id.
    pair = await _issue_token_pair(
        sub=str(user.id),
        role=user.role.value,
        tenant_id=user.tenant_id or str(user.id),
        school_id=user.school_id,
        db=db,
    )
    return {**pair, "user": _user_public(user)}


# ---------------------------------------------------------------------------
# Phone-based login (teachers identify by phone, not email)
# ---------------------------------------------------------------------------


async def login_by_phone(
    phone: str,
    password: str,
    db: AsyncDatabase,
) -> dict[str, Any]:
    """Authenticate a teacher by phone number and return a JWT + public user data.

    Teachers have no email in the legacy schema — they are looked up by phone.
    SECURITY: plain password is never logged.
    """
    auth_failures = get_counter("auth.failures")
    repo = UserRepository(db)

    user = await repo.find_by_phone(phone)
    if user is None or not user.hashed_password or not verify_password(password, user.hashed_password):
        logger.warning("auth: teacher login failed — invalid credentials")
        auth_failures.add(1, {"reason": "invalid_credentials"})
        raise UnauthorizedError("Invalid phone or password")

    if not user.is_active:
        logger.warning("auth: teacher login failed — inactive account %s", user.id)
        auth_failures.add(1, {"reason": "inactive_account"})
        raise UnauthorizedError("Invalid phone or password")

    pair = await _issue_token_pair(
        sub=str(user.id),
        role=user.role.value,
        tenant_id=user.tenant_id or str(user.id),
        school_id=user.school_id,
        db=db,
    )
    return {**pair, "user": _user_public(user)}


# ---------------------------------------------------------------------------
# Register teacher
# ---------------------------------------------------------------------------


async def register_teacher(
    data: TeacherCreate,
    db: AsyncDatabase,
) -> User:
    """
    Register a new teacher user.

    Raises ConflictError if email is already taken.
    SECURITY: password is hashed before storage; plaintext is never retained.
    """
    try:
        role = UserRole(data.role)
    except ValueError:
        raise ConflictError(f"invalid role: {data.role}")

    repo = UserRepository(db)

    existing = await repo.find_by_email(data.email)
    if existing is not None:
        raise ConflictError(f"email {data.email}")

    hashed = hash_password(data.password)

    user = await repo.create(
        UserCreate(
            role=role,
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
    db: AsyncDatabase,
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


async def refresh(
    refresh_token: str,
    db: AsyncDatabase,
) -> TokenPair:
    settings = get_settings()
    repo = UserRepository(db)

    async def verify_owner_active(owner_id: str, claims: UserClaims) -> UserClaims:
        user = await repo.find_by_id(owner_id)
        if user is None or not user.is_active:
            raise AppError("TENANT_NOT_ALLOWED", "Account is inactive or no longer exists", 403)
        return claims

    async def build_access_token(owner_id: str, claims: UserClaims) -> tuple[str, int]:
        token = create_access_token({"sub": owner_id, **claims})
        expires_in = int(_parse_expires_delta(settings.jwt_expires_in).total_seconds())
        return token, expires_in

    return await refresh_tokens.rotate(
        UserRefreshTokenRepository(db),
        refresh_token,
        verify_owner_active=verify_owner_active,
        build_access_token=build_access_token,
        refresh_ttl=settings.refresh_token_expires_in,
        reuse_counter_name="auth.reuse_detected",
    )


# ---------------------------------------------------------------------------
# Profile helpers
# ---------------------------------------------------------------------------


async def get_user_profile(
    user_id: str,
    entity_label: str,
    db: AsyncDatabase,
) -> User:
    """Fetch a user document by ID; raise NotFoundError if absent."""
    user = await UserRepository(db).find_by_id(user_id)
    if user is None:
        raise NotFoundError(entity_label, user_id)
    return user


async def change_password(
    user_id: str,
    new_password: str,
    db: AsyncDatabase,
) -> None:
    """Hash *new_password* and persist it for *user_id*. Raises NotFoundError if absent."""
    repo = UserRepository(db)
    if await repo.find_by_id(user_id) is None:
        raise NotFoundError("User", user_id)
    await repo.update(user_id, {"hashed_password": hash_password(new_password)})


async def get_school_admin_profile(
    school_id: str,
    tenant_id: str,
    db: AsyncDatabase,
) -> UserPublicResponse:
    """Return the school document for a school admin (parity with backend-server getMe).

    Excludes hashed_password from the response.
    """
    user = await UserRepository(db).find_by_school_id_and_tenant_id(school_id, tenant_id)
    if user is None:
        raise NotFoundError("School", school_id)
    return UserPublicResponse.from_domain(user)


async def get_tenant_names(
    db: AsyncDatabase,
) -> list[dict[str, str]]:
    """Return a list of all tenant names (public endpoint)."""
    cursor = db["users"].find({"role": UserRole.TENANT.value}, {"tenant_name": 1, "name": 1})
    docs = await cursor.to_list(length=None)
    return [
        {"id": str(d["_id"]), "name": d.get("tenant_name") or d.get("name", "")}
        for d in docs
    ]


async def get_tenant_dashboard(
    tenant_id: str,
    db: AsyncDatabase,
) -> TenantDashboardResponse:
    """Return aggregated dashboard statistics for a tenant."""
    all_users = await UserRepository(db).find_all_by_tenant(tenant_id)
    schools = [u for u in all_users if u.role == UserRole.SCHOOL_ADMIN]
    teacher_count = sum(1 for u in all_users if u.role == UserRole.TEACHER)
    student_count = sum(1 for u in all_users if u.role == UserRole.STUDENT)

    class_count = 0
    classroom_repo = ClassroomRepository(db)
    school_rows = []
    for school in schools:
        sid = str(school.id)
        classes = await classroom_repo.find_by_school(sid)
        class_count += len(classes)
        school_rows.append(
            SchoolDashboardRow(
                **SchoolResponse.from_domain(school).to_response(),
                teacher_count=sum(1 for u in all_users if str(u.school_id) == sid and u.role == UserRole.TEACHER),
                student_count=sum(1 for u in all_users if str(u.school_id) == sid and u.role == UserRole.STUDENT),
                class_count=len(classes),
            )
        )

    return TenantDashboardResponse(
        statistics=DashboardStatistics(
            total_schools=len(schools),
            total_teachers=teacher_count,
            total_students=student_count,
            total_classes=class_count,
        ),
        schools=school_rows,
    )


# ---------------------------------------------------------------------------
# AuthService class — thin OO wrapper around the module-level functions above
# ---------------------------------------------------------------------------


class AuthService:
    """Stateful wrapper around auth module-level functions, bound to a single DB session.

    Intended for use with FastAPI's dependency injection via ``get_auth_service``.
    All module-level functions are preserved for backward compatibility.
    """

    def __init__(self, db: AsyncDatabase[Any]) -> None:
        self._db = db

    async def login_unified(self, identifier: str, password: str, is_email: bool) -> dict:
        return await login_unified(identifier, password, is_email, self._db)

    async def login_by_phone(self, phone: str, password: str) -> dict:
        return await login_by_phone(phone, password, self._db)

    async def register_teacher(self, data: TeacherCreate) -> User:
        return await register_teacher(data, self._db)

    async def register_tenant(self, data: TenantCreate) -> User:
        return await register_tenant(data, self._db)

    async def refresh(self, refresh_token: str) -> TokenPair:
        return await refresh(refresh_token, self._db)

    async def logout(self, owner_id: str) -> None:
        repo = UserRefreshTokenRepository(self._db)
        await repo.revoke_all_for_owner(owner_id)

    async def get_user_profile(self, user_id: str, entity_label: str) -> User:
        return await get_user_profile(user_id, entity_label, self._db)

    async def change_password(self, user_id: str, new_password: str) -> None:
        return await change_password(user_id, new_password, self._db)

    async def get_school_admin_profile(self, school_id: str, tenant_id: str) -> UserPublicResponse:
        return await get_school_admin_profile(school_id, tenant_id, self._db)

    async def get_tenant_names(self) -> list[dict[str, str]]:
        return await get_tenant_names(self._db)

    async def get_tenant_dashboard(self, tenant_id: str) -> TenantDashboardResponse:
        return await get_tenant_dashboard(tenant_id, self._db)


def get_auth_service(db: AsyncDatabase[Any] = Depends(get_db)) -> AuthService:
    return AuthService(db)
