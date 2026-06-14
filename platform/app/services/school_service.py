"""
School service — ported from backend-server/src/services/school.service.js.

Covers School CRUD and Classroom CRUD using Motor repositories.

SECURITY:
  - Passwords are hashed with bcrypt before storage.
  - hashed_password is never returned to callers.
"""

from __future__ import annotations

import logging
from typing import Any, List, Optional

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.classroom import Classroom, ClassroomCreate
from app.models.school import School, SchoolCreate
from app.platform.auth.hashing import hash_password
from app.platform.error_handling import ConflictError, NotFoundError, ValidationError
from app.repositories.classroom_repository import ClassroomRepository
from app.repositories.school_repository import SchoolRepository
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# School CRUD
# ---------------------------------------------------------------------------


async def get_school(school_id: str, db: AsyncIOMotorDatabase) -> School:  # type: ignore[type-arg]
    """Fetch a school by its _id.

    Raises NotFoundError when not found.
    """
    repo = SchoolRepository(db)
    school = await repo.find_by_id(school_id)
    if school is None:
        raise NotFoundError("School", school_id)
    return school


async def create_school(data: SchoolCreate, db: AsyncIOMotorDatabase) -> School:  # type: ignore[type-arg]
    """Create a new school.

    Raises ConflictError if the email is already registered.
    SECURITY: password (if provided in plain text via a helper) must be
    hashed before SchoolCreate is constructed.  This function does NOT
    accept plain-text passwords.
    """
    repo = SchoolRepository(db)
    existing = await repo.find_by_email(data.email)
    if existing is not None:
        raise ConflictError(f"School with email {data.email}")
    return await repo.create(data)


async def create_school_with_password(
    name: str,
    email: str,
    tenant_id: str,
    plain_password: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> School:
    """Convenience wrapper: hash the password then call create_school.

    Ported from school.service.js createSchool().
    Raises ConflictError if email is already taken.
    """
    repo = SchoolRepository(db)
    existing = await repo.find_by_email(email)
    if existing is not None:
        raise ConflictError(f"School with email {email}")

    hashed = hash_password(plain_password)
    data = SchoolCreate(
        tenant_id=tenant_id,
        name=name.strip(),
        email=email.strip(),
        hashed_password=hashed,
        is_active=True,
    )
    return await repo.create(data)


async def update_school(
    school_id: str,
    updates: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> School:
    """Apply partial updates to a school document.

    Raises NotFoundError if the school does not exist.
    """
    repo = SchoolRepository(db)
    existing = await repo.find_by_id(school_id)
    if existing is None:
        raise NotFoundError("School", school_id)
    updated = await repo.update(school_id, updates)
    if updated is None:
        raise NotFoundError("School", school_id)
    return updated


async def get_school_by_tenant(
    tenant_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> Optional[School]:
    """Return the first school belonging to *tenant_id*, or None."""
    repo = SchoolRepository(db)
    schools = await repo.find_all_by_tenant(tenant_id)
    return schools[0] if schools else None


async def list_schools_by_tenant(
    tenant_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> List[School]:
    """Return all schools belonging to *tenant_id*."""
    repo = SchoolRepository(db)
    return await repo.find_all_by_tenant(tenant_id)


async def delete_school(
    school_id: str,
    tenant_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> bool:
    """Delete a school after validating it has no teachers/students.

    Ported from school.service.js deleteSchool().
    Raises NotFoundError if the school does not exist.
    Raises ValidationError if the school still has members.
    """
    repo = SchoolRepository(db)
    school = await repo.find_by_id(school_id)
    if school is None or school.tenant_id != tenant_id:
        raise NotFoundError("School", school_id)

    user_repo = UserRepository(db)
    teachers = await user_repo.find_all_by_tenant(tenant_id)
    school_teachers = [u for u in teachers if u.school_id == school_id and u.role.value == "teacher"]
    if school_teachers:
        raise ValidationError("School has teachers — remove them before deleting")

    school_students = [u for u in teachers if u.school_id == school_id and u.role.value == "student"]
    if school_students:
        raise ValidationError("School has students — remove them before deleting")

    return await repo.delete(school_id)


async def get_school_dashboard(
    school_id: str,
    tenant_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> dict[str, Any]:
    """Return summary counts for a school's dashboard.

    Ported from school.service.js getSchoolDashboard().
    """
    repo = SchoolRepository(db)
    school = await repo.find_by_id(school_id)
    if school is None or school.tenant_id != tenant_id:
        raise NotFoundError("School", school_id)

    user_repo = UserRepository(db)
    classroom_repo = ClassroomRepository(db)

    all_users = await user_repo.find_all_by_tenant(tenant_id)
    teacher_count = sum(
        1 for u in all_users if u.school_id == school_id and u.role.value == "teacher"
    )
    student_count = sum(
        1 for u in all_users if u.school_id == school_id and u.role.value == "student"
    )
    classes = await classroom_repo.find_by_school(school_id)
    return {
        "school": school.model_dump(by_alias=False, exclude_none=True),
        "teachers": teacher_count,
        "students": student_count,
        "classes": len(classes),
    }


# ---------------------------------------------------------------------------
# Classroom CRUD
# ---------------------------------------------------------------------------


async def create_classroom(
    data: ClassroomCreate,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> Classroom:
    """Create a new classroom."""
    repo = ClassroomRepository(db)
    return await repo.create(data)


async def get_classroom(
    classroom_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> Classroom:
    """Fetch a classroom by its _id.

    Raises NotFoundError when not found.
    """
    repo = ClassroomRepository(db)
    classroom = await repo.find_by_id(classroom_id)
    if classroom is None:
        raise NotFoundError("Classroom", classroom_id)
    return classroom


async def update_classroom(
    classroom_id: str,
    updates: dict[str, Any],
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> Classroom:
    """Apply partial updates to a classroom.

    Raises NotFoundError if not found.
    """
    repo = ClassroomRepository(db)
    existing = await repo.find_by_id(classroom_id)
    if existing is None:
        raise NotFoundError("Classroom", classroom_id)
    updated = await repo.update(classroom_id, updates)
    if updated is None:
        raise NotFoundError("Classroom", classroom_id)
    return updated


async def list_classrooms_by_school(
    school_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> List[Classroom]:
    """Return all classrooms belonging to *school_id*."""
    repo = ClassroomRepository(db)
    return await repo.find_by_school(school_id)


async def list_classrooms_by_teacher(
    teacher_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> List[Classroom]:
    """Return all classrooms assigned to *teacher_id*."""
    repo = ClassroomRepository(db)
    return await repo.find_by_teacher(teacher_id)


async def delete_classroom(
    classroom_id: str,
    db: AsyncIOMotorDatabase,  # type: ignore[type-arg]
) -> bool:
    """Delete a classroom by ID.

    Raises NotFoundError if not found.
    """
    repo = ClassroomRepository(db)
    existing = await repo.find_by_id(classroom_id)
    if existing is None:
        raise NotFoundError("Classroom", classroom_id)
    return await repo.delete(classroom_id)
