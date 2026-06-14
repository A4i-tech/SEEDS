"""
School controller — school and classroom management.

Ported from backend-server:
  - src/routes/schoolRouter.js   (POST /school, GET /school, GET /school/teachers,
                                   POST /school/transfer, GET /school/dashboard,
                                   POST /school/analytics, GET /school/{id},
                                   PATCH /school/{id}, DELETE /school/{id})
  - src/routes/classRouter.js    (GET /class, GET /class/{id},
                                   POST /class (create/update),
                                   DELETE /class/{id})

SECURITY:
  - School write operations require require_tenant.
  - Class operations require get_current_user (any authenticated user).
  - Teacher transfer requires require_teacher.
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
from app.platform.error_handling import ForbiddenError, NotFoundError
from app.repositories.school_repository import SchoolRepository
from app.repositories.user_repository import UserRepository
from app.services import school_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["School"])


# ---------------------------------------------------------------------------
# Request / Response schemas
# ---------------------------------------------------------------------------


class SchoolCreateRequest(BaseModel):
    name: str
    email: str
    password: str


class SchoolUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


class TeacherTransferRequest(BaseModel):
    teacher_id: str = Field(..., alias="teacherId")
    target_school_id: str = Field(..., alias="targetSchoolId")

    model_config = {"populate_by_name": True}


class SchoolAnalyticsRequest(BaseModel):
    start_date: str = Field(..., alias="startDate")
    end_date: str = Field(..., alias="endDate")

    model_config = {"populate_by_name": True}


class ClassroomUpsertRequest(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: Optional[str] = None
    students: List[str] = Field(default_factory=list)
    leaders: List[str] = Field(default_factory=list)
    content_ids: List[str] = Field(default_factory=list, alias="contentIds")

    model_config = {"populate_by_name": True}


# ---------------------------------------------------------------------------
# School routes
# ---------------------------------------------------------------------------


@router.post(
    "/school",
    summary="Create a new school (tenant only)",
    status_code=status.HTTP_201_CREATED,
)
async def create_school(
    body: SchoolCreateRequest,
    current_user: dict[str, Any] = Depends(require_tenant),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Create a new school under the authenticated tenant."""
    tenant_id: str = current_user.get("sub", "")
    school = await school_service.create_school_with_password(
        name=body.name,
        email=body.email,
        tenant_id=tenant_id,
        plain_password=body.password,
        db=db,
    )
    result = school.model_dump(by_alias=False, exclude_none=True)
    result.pop("hashed_password", None)
    return result


@router.get(
    "/school",
    summary="List schools for current tenant",
    status_code=status.HTTP_200_OK,
)
async def list_schools(
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> List[dict]:
    """Return all schools belonging to the authenticated tenant."""
    tenant_id: str = current_user.get("sub", "") or current_user.get("tenant_id", "")
    # For school_admin, tenant_id is in the token's tenant_id claim
    if current_user.get("role") != "tenant":
        tenant_id = current_user.get("tenant_id", "")

    schools = await school_service.list_schools_by_tenant(tenant_id, db)
    result = []
    for s in schools:
        d = s.model_dump(by_alias=False, exclude_none=True)
        d.pop("hashed_password", None)
        result.append(d)
    return result


@router.get(
    "/school/teachers",
    summary="List teachers in the admin's school (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def school_teachers(
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> List[dict]:
    """Return all teachers in the caller's school (mirrors /teacher/teachers)."""
    school_id = current_user.get("school_id", "")
    tenant_id = current_user.get("tenant_id", "")
    if not school_id:
        return []
    repo = UserRepository(db)
    all_users = await repo.find_all_by_tenant(tenant_id)
    return [
        {
            "_id": str(u.id),
            "name": u.name,
            "phoneNumber": u.phone or "",
            "role": u.role.value,
        }
        for u in all_users
        if u.school_id == school_id and u.role.value in ("teacher", "content_creator")
    ]


@router.post(
    "/school/transfer",
    summary="Transfer a teacher to another school (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def transfer_teacher(
    body: TeacherTransferRequest,
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Transfer a teacher from the admin's school to a target school."""
    repo = UserRepository(db)
    teacher = await repo.find_by_id(body.teacher_id)
    if teacher is None:
        raise NotFoundError("Teacher", body.teacher_id)

    # Verify target school exists
    school_repo = SchoolRepository(db)
    target_school = await school_repo.find_by_id(body.target_school_id)
    if target_school is None:
        raise NotFoundError("School", body.target_school_id)

    updated = await repo.update(body.teacher_id, {"school_id": body.target_school_id})
    if updated is None:
        raise NotFoundError("Teacher", body.teacher_id)

    safe = updated.model_dump(by_alias=False, exclude_none=True)
    safe.pop("hashed_password", None)
    return {"message": "Teacher transferred successfully", "teacher": safe}


@router.get(
    "/school/dashboard",
    summary="Get school dashboard (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def school_dashboard(
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return dashboard summary for the caller's school."""
    school_id = current_user.get("school_id", "")
    tenant_id = current_user.get("tenant_id", "")
    return await school_service.get_school_dashboard(school_id, tenant_id, db)


@router.post(
    "/school/analytics",
    summary="Get school analytics (school_admin only)",
    status_code=status.HTTP_200_OK,
)
async def school_analytics(
    body: SchoolAnalyticsRequest,
    current_user: dict[str, Any] = Depends(require_teacher),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return call-log analytics for the caller's school over a date range."""
    from datetime import datetime  # noqa: PLC0415

    start = datetime.fromisoformat(body.start_date)
    end = datetime.fromisoformat(body.end_date)
    school_id = current_user.get("school_id", "")

    cursor = db["ivr_v2_logs"].find(
        {
            "school_id": school_id,
            "created_at": {"$gte": start.isoformat(), "$lte": end.isoformat()},
        }
    )
    data = await cursor.to_list(length=None)
    return {
        "startDate": body.start_date,
        "endDate": body.end_date,
        "count": len(data),
        "data": data,
    }


@router.get(
    "/school/{school_id}",
    summary="Get school by ID (tenant only)",
    status_code=status.HTTP_200_OK,
)
async def get_school(
    school_id: str,
    current_user: dict[str, Any] = Depends(require_tenant),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return school details for a given school ID."""
    school = await school_service.get_school(school_id, db)
    result = school.model_dump(by_alias=False, exclude_none=True)
    result.pop("hashed_password", None)
    return result


@router.patch(
    "/school/{school_id}",
    summary="Update a school",
    status_code=status.HTTP_200_OK,
)
async def update_school(
    school_id: str,
    body: SchoolUpdateRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Apply partial updates to a school (school_admin or tenant)."""
    from app.platform.auth.hashing import hash_password  # noqa: PLC0415

    updates: dict[str, Any] = {}
    if body.name:
        updates["name"] = body.name.strip()
    if body.email:
        updates["email"] = body.email.strip()
    if body.password:
        updates["hashed_password"] = hash_password(body.password)

    school = await school_service.update_school(school_id, updates, db)
    result = school.model_dump(by_alias=False, exclude_none=True)
    result.pop("hashed_password", None)
    return result


@router.delete(
    "/school/{school_id}",
    summary="Delete a school (tenant only)",
    status_code=status.HTTP_200_OK,
)
async def delete_school(
    school_id: str,
    current_user: dict[str, Any] = Depends(require_tenant),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Delete a school (only if it has no teachers or students)."""
    tenant_id: str = current_user.get("sub", "")
    await school_service.delete_school(school_id, tenant_id, db)
    return {"message": "School deleted successfully"}


# ---------------------------------------------------------------------------
# Class routes
# ---------------------------------------------------------------------------


@router.get(
    "/class",
    summary="List classes (by teacher or by school)",
    status_code=status.HTTP_200_OK,
)
async def list_classes(
    school_id: Optional[str] = Query(None, alias="school_id"),
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> List[dict]:
    """Return classes.  If school_id query param supplied, filter by school.
    Otherwise return classes for the calling teacher.
    """
    if school_id:
        classrooms = await school_service.list_classrooms_by_school(school_id, db)
    else:
        teacher_id = current_user.get("sub", "")
        classrooms = await school_service.list_classrooms_by_teacher(teacher_id, db)
    return [c.model_dump(by_alias=False, exclude_none=True) for c in classrooms]


@router.get(
    "/class/{class_id}",
    summary="Get class by ID",
    status_code=status.HTTP_200_OK,
)
async def get_class(
    class_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return class details for a given class ID."""
    classroom = await school_service.get_classroom(class_id, db)
    return classroom.model_dump(by_alias=False, exclude_none=True)


@router.post(
    "/class",
    summary="Create or update a class",
    status_code=status.HTTP_200_OK,
)
async def upsert_class(
    body: ClassroomUpsertRequest,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Create a new class or update an existing one.

    If ``_id`` is supplied in the body, an update is performed.
    The teacher field is always set to the calling user's ID.
    """
    from app.models.classroom import ClassroomCreate  # noqa: PLC0415
    from app.repositories.classroom_repository import ClassroomRepository  # noqa: PLC0415

    teacher_id = current_user.get("sub", "")
    school_id = current_user.get("school_id", "")
    repo = ClassroomRepository(db)

    if body.id:
        # Update path: verify ownership
        existing = await repo.find_by_id(body.id)
        if existing is None:
            raise NotFoundError("Classroom", body.id)
        if existing.teacher != teacher_id:
            raise ForbiddenError("not classroom owner")
        updates: dict[str, Any] = {}
        if body.name is not None:
            updates["name"] = body.name
        if body.students is not None:
            updates["students"] = body.students
        if body.leaders is not None:
            updates["leaders"] = body.leaders
        if body.content_ids is not None:
            updates["content_ids"] = body.content_ids
        classroom = await repo.update(body.id, updates)
        if classroom is None:
            raise NotFoundError("Classroom", body.id)
    else:
        # Create path
        classroom = await repo.create(
            ClassroomCreate(
                school_id=school_id,
                name=body.name or "",
                teacher=teacher_id,
                students=body.students,
                leaders=body.leaders,
                content_ids=body.content_ids,
            )
        )

    return classroom.model_dump(by_alias=False, exclude_none=True)


@router.delete(
    "/class/{class_id}",
    summary="Delete a class",
    status_code=status.HTTP_200_OK,
)
async def delete_class(
    class_id: str,
    current_user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, str]:
    """Delete a class by ID."""
    await school_service.delete_classroom(class_id, db)
    return {"message": "Class deleted successfully"}
