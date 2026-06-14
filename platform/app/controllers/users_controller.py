"""
Users controller — teacher CRUD, student CRUD, user endpoints, tenant CRUD.

Ported from backend-server:
  - src/routes/teacherRouter.js  (GET /teacher/teachers,
                                   PATCH /teacher/{teacherId},
                                   DELETE /teacher/{teacherId})
  - src/routes/studentRouter.js  (POST /student, GET /student,
                                   PATCH /student/{id}, DELETE /student/{id})
  - src/routes/userRouter.js     (GET /user/participants)
  - src/routes/tenantRouter.js   (already handled in auth_controller)

SECURITY:
  - All write endpoints require require_teacher or require_tenant deps.
  - GET /user/participants was UNPROTECTED in the legacy service; it now
    requires require_teacher authentication (security fix).
  - Passwords are hashed before storage; plain text is never returned.
"""

from __future__ import annotations

import logging
from typing import Any, List, Optional

from fastapi import APIRouter, Depends, Query, status
from motor.motor_asyncio import AsyncIOMotorDatabase
from pydantic import BaseModel, Field

from app.platform.auth.dependencies import (
    get_current_user,
    get_db,
    require_teacher,
    require_tenant,
)
from app.platform.auth.hashing import hash_password
from app.platform.error_handling import ConflictError, NotFoundError, ValidationError
from app.repositories.user_repository import UserRepository
from app.models.user import UserCreate, UserRole

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Users"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class TeacherUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = Field(None, alias="phoneNumber")
    password: Optional[str] = None

    model_config = {"populate_by_name": True}


class StudentCreateRequest(BaseModel):
    name: str
    phone_number: str = Field(..., alias="phoneNumber")

    model_config = {"populate_by_name": True}


class StudentUpdateRequest(BaseModel):
    name: Optional[str] = None
    phone_number: Optional[str] = Field(None, alias="phoneNumber")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# Teacher routes
# ---------------------------------------------------------------------------


@router.get(
    "/teacher/teachers",
    summary="List teachers in admin's school (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def list_teachers_by_school(
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> List[dict]:
    """Return all teachers belonging to the caller's school."""
    school_id = current_user.get("school_id", "")
    if not school_id:
        return []
    repo = UserRepository(db)
    users = await repo.find_all_by_tenant(current_user.get("tenant_id", ""))
    teachers = [
        {
            "_id": str(u.id),
            "name": u.name,
            "phoneNumber": u.phone or "",
            "role": u.role.value,
        }
        for u in users
        if u.school_id == school_id and u.role.value in ("teacher", "content_creator")
    ]
    return sorted(teachers, key=lambda t: t["name"])


@router.patch(
    "/teacher/{teacher_id}",
    summary="Update a teacher (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def update_teacher(
    teacher_id: str,
    body: TeacherUpdateRequest,
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Apply partial updates (name, phone, password) to a teacher document."""
    if not body.name and not body.phone_number and not body.password:
        from fastapi import HTTPException  # noqa: PLC0415
        raise HTTPException(
            status_code=400,
            detail="At least one field (name, phoneNumber, password) is required",
        )

    repo = UserRepository(db)
    existing = await repo.find_by_id(teacher_id)
    if existing is None:
        raise NotFoundError("Teacher", teacher_id)

    # Scope check: must belong to same school as caller
    caller_school = current_user.get("school_id", "")
    if caller_school and existing.school_id != caller_school:
        raise NotFoundError("Teacher", teacher_id)

    updates: dict[str, Any] = {}
    if body.name:
        updates["name"] = body.name.strip()
    if body.phone_number:
        updates["phone"] = body.phone_number
    if body.password:
        updates["hashed_password"] = hash_password(body.password)

    updated = await repo.update(teacher_id, updates)
    if updated is None:
        raise NotFoundError("Teacher", teacher_id)

    safe = updated.model_dump(by_alias=False, exclude_none=True)
    safe.pop("hashed_password", None)
    return safe


@router.delete(
    "/teacher/{teacher_id}",
    summary="Delete a teacher (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def delete_teacher(
    teacher_id: str,
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, str]:
    """Delete a teacher from the caller's school."""
    repo = UserRepository(db)
    existing = await repo.find_by_id(teacher_id)
    if existing is None:
        raise NotFoundError("Teacher", teacher_id)

    caller_school = current_user.get("school_id", "")
    if caller_school and existing.school_id != caller_school:
        raise NotFoundError("Teacher", teacher_id)

    await repo.delete(teacher_id)
    return {"message": "Teacher deleted successfully"}


# ---------------------------------------------------------------------------
# Student routes
# ---------------------------------------------------------------------------


@router.post(
    "/student",
    summary="Create a student (school_admin only)",
    status_code=status.HTTP_201_CREATED,
)
async def create_student(
    body: StudentCreateRequest,
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Add a student to the caller's school."""
    if not body.name.strip():
        from fastapi import HTTPException  # noqa: PLC0415
        raise HTTPException(status_code=400, detail="name and phoneNumber are required")

    repo = UserRepository(db)

    # Duplicate phone check within school
    school_id = current_user.get("school_id", "")
    tenant_id = current_user.get("tenant_id", "")
    existing_phone = await repo.find_by_phone(body.phone_number)
    if existing_phone and existing_phone.school_id == school_id:
        raise ConflictError("Phone number already in use in this school")

    user = await repo.create(
        UserCreate(
            role=UserRole.STUDENT,
            name=body.name.strip(),
            phone=body.phone_number,
            school_id=school_id,
            tenant_id=tenant_id,
        )
    )
    return {
        "_id": str(user.id),
        "name": user.name,
        "phoneNumber": user.phone or "",
        "schoolId": user.school_id or "",
    }


@router.get(
    "/student",
    summary="List students in admin's school",
    status_code=status.HTTP_200_OK,
)
async def list_students(
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> List[dict]:
    """Return all students in the caller's school."""
    school_id = current_user.get("school_id", "")
    tenant_id = current_user.get("tenant_id", "")
    if not school_id:
        return []
    repo = UserRepository(db)
    all_users = await repo.find_all_by_tenant(tenant_id)
    students = [
        {
            "_id": str(u.id),
            "name": u.name,
            "phoneNumber": u.phone or "",
        }
        for u in all_users
        if u.school_id == school_id and u.role.value == "student"
    ]
    return sorted(students, key=lambda s: s["name"])


@router.patch(
    "/student/{student_id}",
    summary="Update a student (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def update_student(
    student_id: str,
    body: StudentUpdateRequest,
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Apply partial updates to a student document."""
    if not body.name and not body.phone_number:
        from fastapi import HTTPException  # noqa: PLC0415
        raise HTTPException(status_code=400, detail="name or phoneNumber is required")

    repo = UserRepository(db)
    existing = await repo.find_by_id(student_id)
    if existing is None:
        raise NotFoundError("Student", student_id)

    caller_school = current_user.get("school_id", "")
    if caller_school and existing.school_id != caller_school:
        raise NotFoundError("Student", student_id)

    updates: dict[str, Any] = {}
    if body.name:
        updates["name"] = body.name.strip()
    if body.phone_number:
        # Duplicate phone check
        dup = await repo.find_by_phone(body.phone_number)
        if dup and str(dup.id) != student_id and dup.school_id == caller_school:
            raise ConflictError("Phone number already in use in this school")
        updates["phone"] = body.phone_number

    updated = await repo.update(student_id, updates)
    if updated is None:
        raise NotFoundError("Student", student_id)

    return {
        "_id": str(updated.id),
        "name": updated.name,
        "phoneNumber": updated.phone or "",
        "schoolId": updated.school_id or "",
    }


@router.delete(
    "/student/{student_id}",
    summary="Delete a student (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def delete_student(
    student_id: str,
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, str]:
    """Delete a student from the caller's school."""
    repo = UserRepository(db)
    existing = await repo.find_by_id(student_id)
    if existing is None:
        raise NotFoundError("Student", student_id)

    caller_school = current_user.get("school_id", "")
    if caller_school and existing.school_id != caller_school:
        raise NotFoundError("Student", student_id)

    await repo.delete(student_id)
    return {"message": "Student deleted successfully"}


# ---------------------------------------------------------------------------
# User routes
# ---------------------------------------------------------------------------


@router.get(
    "/user/participants",
    summary="Get all participants (requires auth — SECURITY FIX)",
    status_code=status.HTTP_200_OK,
)
async def get_participants(
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> List[dict]:
    """Return all participant (student) users visible to the caller.

    SECURITY FIX: This endpoint was UNPROTECTED in the legacy backend-server
    (userRouter.js).  It now requires a valid teacher-role JWT.
    """
    tenant_id = current_user.get("tenant_id", "")
    school_id = current_user.get("school_id", "")
    repo = UserRepository(db)

    if tenant_id:
        all_users = await repo.find_all_by_tenant(tenant_id)
    else:
        # Fallback: return empty list if no tenant context
        return []

    return [
        {
            "_id": str(u.id),
            "name": u.name,
            "phone": u.phone or "",
            "role": u.role.value,
        }
        for u in all_users
        if not school_id or u.school_id == school_id
    ]
