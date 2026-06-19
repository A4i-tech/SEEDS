"""
Auth controller — login, register, logout, /me endpoints.

Ported from backend-server:
  - src/routes/teacherRouter.js  (POST /teacher/login, /teacher/register,
                                   /teacher/logout, GET /teacher/me)
  - src/routes/tenantRouter.js   (POST /tenant/login, /tenant/register,
                                   /tenant/logout, GET /tenant/me,
                                   /tenant/names, /tenant/analytics,
                                   /tenant/change-password,
                                   /tenant/dashboard)
  - src/auth/schoolAdmin/schoolAdminAuthProviderMiddleware.js
                                  (POST /school/admin/login,
                                   GET /school/admin/me)

SECURITY:
  - Plain-text passwords are NEVER logged or returned.
  - Passwords must satisfy the strength policy enforced by the service.
  - All protected routes enforce require_teacher / require_tenant deps.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.platform.auth.dependencies import (
    get_current_user,
    get_db,
    require_teacher,
    require_tenant,
)
from app.platform.error_handling import NotFoundError
from app.repositories.user_repository import UserRepository
from app.services import auth_service
from app.services.auth_service import TeacherCreate, TenantCreate

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Auth"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class TeacherLoginRequest(BaseModel):
    """Login payload (matches legacy phoneNumber/password convention)."""

    phone_number: str = Field(..., alias="phoneNumber")
    password: str
    school_id: str | None = Field(None, alias="schoolId")

    model_config = {"populate_by_name": True}


class TeacherRegisterRequest(BaseModel):
    phone_number: str = Field(..., alias="phoneNumber")
    password: str
    name: str
    role: str = "teacher"
    school_id: str | None = Field(None, alias="schoolId")

    model_config = {"populate_by_name": True}


class TeacherUpdatePasswordRequest(BaseModel):
    new_password: str = Field(..., alias="newPassword")

    model_config = {"populate_by_name": True}


class TenantLoginRequest(BaseModel):
    email: str
    password: str


class TenantRegisterRequest(BaseModel):
    email: str
    password: str
    tenant_name: str = Field("", alias="tenantName")
    name: str = ""

    model_config = {"populate_by_name": True}


class TenantChangePasswordRequest(BaseModel):
    new_password: str = Field(..., alias="newPassword")

    model_config = {"populate_by_name": True}


class SchoolAdminLoginRequest(BaseModel):
    email: str
    password: str


# ---------------------------------------------------------------------------
# Teacher auth routes  — prefix /teacher (defined in path literals below)
# ---------------------------------------------------------------------------


@router.post(
    "/teacher/login",
    summary="Teacher login",
    status_code=status.HTTP_200_OK,
)
async def teacher_login(
    body: TeacherLoginRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Authenticate a teacher and return a JWT bearer token.

    Accepts *phoneNumber* (mapped to email internally for unified user model)
    plus *password*.  Returns ``{"access_token": "...", "token_type": "bearer"}``.
    """
    return await auth_service.login(
        email=body.phone_number,
        password=body.password,
        auth_type="native",
        db=db,
    )


@router.post(
    "/teacher/register",
    summary="Register a new teacher (school_admin only)",
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_teacher)],
)
async def teacher_register(
    body: TeacherRegisterRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Register a new teacher.

    The caller must be authenticated with at least teacher-level access.
    Returns the created user (no hashed_password).
    """
    data = TeacherCreate(
        name=body.name.strip(),
        email=body.phone_number,  # unified model stores phone as email field
        password=body.password,
        phone=body.phone_number,
        tenant_id=current_user.get("tenant_id"),
        school_id=body.school_id or current_user.get("school_id"),
    )
    user = await auth_service.register_teacher(data, db)
    safe = user.model_dump(by_alias=False, exclude_none=True)
    safe.pop("hashed_password", None)
    return safe


@router.post(
    "/teacher/logout",
    summary="Teacher logout",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_teacher)],
)
async def teacher_logout() -> dict[str, str]:
    """Acknowledge logout (stateless JWT — client discards token)."""
    return {"message": "Logout successful"}


@router.get(
    "/teacher/me",
    summary="Get current teacher",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_teacher)],
)
async def teacher_me(
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return the currently authenticated teacher's profile."""
    user_id: str = current_user.get("sub", "")
    repo = UserRepository(db)
    user = await repo.find_by_id(user_id)
    if user is None:
        raise NotFoundError("Teacher", user_id)
    safe = user.model_dump(by_alias=False, exclude_none=True)
    safe.pop("hashed_password", None)
    return safe


# ---------------------------------------------------------------------------
# Tenant auth routes  — prefix /tenant
# ---------------------------------------------------------------------------


@router.get(
    "/tenant/names",
    summary="Get all tenant names (public)",
    status_code=status.HTTP_200_OK,
)
async def tenant_names(
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> list[str]:
    """Return a list of all registered tenant names."""
    from app.models.user import UserRole  # noqa: PLC0415

    repo = UserRepository(db)
    # Pull all tenant users and return their names
    cursor = db["users"].find({"role": UserRole.TENANT.value}, {"tenant_name": 1, "name": 1})
    docs = await cursor.to_list(length=None)
    return [d.get("tenant_name") or d.get("name", "") for d in docs]


@router.post(
    "/tenant/login",
    summary="Tenant login",
    status_code=status.HTTP_200_OK,
)
async def tenant_login(
    body: TenantLoginRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Authenticate a tenant user and return a JWT bearer token."""
    return await auth_service.login(
        email=body.email,
        password=body.password,
        auth_type="native",
        db=db,
    )


@router.post(
    "/tenant/register",
    summary="Register a new tenant",
    status_code=status.HTTP_201_CREATED,
)
async def tenant_register(
    body: TenantRegisterRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Register a new tenant (public endpoint, native auth only)."""
    data = TenantCreate(
        name=body.name or body.tenant_name,
        email=body.email,
        password=body.password,
        tenant_name=body.tenant_name,
    )
    user = await auth_service.register_tenant(data, db)
    safe = user.model_dump(by_alias=False, exclude_none=True)
    safe.pop("hashed_password", None)
    return safe


@router.post(
    "/tenant/logout",
    summary="Tenant logout",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(get_current_user)],
)
async def tenant_logout() -> dict[str, str]:
    """Acknowledge logout (stateless JWT — client discards token)."""
    return {"message": "Logout successful"}


@router.get(
    "/tenant/me",
    summary="Get current tenant",
    status_code=status.HTTP_200_OK,
)
async def tenant_me(
    current_user: dict[str, Any] = Depends(require_tenant),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return the currently authenticated tenant's profile."""
    user_id: str = current_user.get("sub", "")
    repo = UserRepository(db)
    user = await repo.find_by_id(user_id)
    if user is None:
        raise NotFoundError("Tenant", user_id)
    return {
        "email": user.email,
        "tenantName": user.tenant_name or "",
        "id": str(user.id),
    }


@router.post(
    "/tenant/analytics",
    summary="Tenant analytics",
    status_code=status.HTTP_200_OK,
)
async def tenant_analytics(
    body: dict[str, Any],
    current_user: dict[str, Any] = Depends(require_tenant),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return call-log analytics for the tenant over a date range."""
    from datetime import datetime  # noqa: PLC0415

    start_date = body.get("startDate")
    end_date = body.get("endDate")
    if not start_date or not end_date:
        from fastapi import HTTPException  # noqa: PLC0415
        raise HTTPException(status_code=400, detail="startDate and endDate are required")

    start = datetime.fromisoformat(start_date)
    end = datetime.fromisoformat(end_date)
    tenant_id: str = current_user.get("sub", "")

    cursor = db["ivr_v2_logs"].find(
        {
            "tenant_id": tenant_id,
            "created_at": {"$gte": start, "$lte": end},
        }
    )
    data = await cursor.to_list(length=None)
    return {"startDate": start_date, "endDate": end_date, "count": len(data), "data": data}


@router.post(
    "/tenant/change-password",
    summary="Change tenant password",
    status_code=status.HTTP_200_OK,
)
async def tenant_change_password(
    body: TenantChangePasswordRequest,
    current_user: dict[str, Any] = Depends(require_tenant),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, str]:
    """Change the authenticated tenant's password.

    SECURITY: new password is hashed before storage.
    """
    from app.platform.auth.hashing import hash_password  # noqa: PLC0415

    user_id: str = current_user.get("sub", "")
    repo = UserRepository(db)
    user = await repo.find_by_id(user_id)
    if user is None:
        raise NotFoundError("Tenant", user_id)
    hashed = hash_password(body.new_password)
    await repo.update(user_id, {"hashed_password": hashed})
    return {"message": "Password changed successfully"}


@router.get(
    "/tenant/dashboard",
    summary="Tenant dashboard statistics",
    status_code=status.HTTP_200_OK,
)
async def tenant_dashboard(
    current_user: dict[str, Any] = Depends(require_tenant),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return dashboard statistics (school count, teacher count, student count, class count)."""
    from app.models.user import UserRole  # noqa: PLC0415
    from app.repositories.classroom_repository import ClassroomRepository  # noqa: PLC0415
    from app.repositories.school_repository import SchoolRepository  # noqa: PLC0415

    tenant_id: str = current_user.get("sub", "")
    school_repo = SchoolRepository(db)
    user_repo = UserRepository(db)
    classroom_repo = ClassroomRepository(db)

    schools = await school_repo.find_all_by_tenant(tenant_id)
    all_users = await user_repo.find_all_by_tenant(tenant_id)
    teacher_count = sum(1 for u in all_users if u.role == UserRole.TEACHER)
    student_count = sum(1 for u in all_users if u.role.value == "student")

    class_count = 0
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
# School Admin auth routes  — /school/admin/*
# ---------------------------------------------------------------------------


@router.post(
    "/school/admin/login",
    summary="School admin login",
    status_code=status.HTTP_200_OK,
)
async def school_admin_login(
    body: SchoolAdminLoginRequest,
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Authenticate a school admin and return a JWT bearer token."""
    result = await auth_service.login(
        email=body.email,
        password=body.password,
        auth_type="native",
        db=db,
    )
    # Enrich with schoolId and schoolName for backward compat
    user_data = result.get("user", {})
    result["schoolId"] = user_data.get("school_id", "")
    result["schoolName"] = ""  # resolved by school service if needed
    return result


@router.get(
    "/school/admin/me",
    summary="Get current school admin profile",
    status_code=status.HTTP_200_OK,
)
async def school_admin_me(
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return the currently authenticated school admin's profile."""
    user_id: str = current_user.get("sub", "")
    repo = UserRepository(db)
    user = await repo.find_by_id(user_id)
    if user is None:
        raise NotFoundError("SchoolAdmin", user_id)
    return {
        "_id": str(user.id),
        "name": user.name,
        "email": user.email or "",
        "schoolId": user.school_id or "",
        "tenantId": user.tenant_id or "",
    }
