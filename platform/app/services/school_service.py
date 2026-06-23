"""
School service — ported from backend-server/src/services/school.service.js.

Covers School CRUD and Classroom CRUD using Motor repositories.

SECURITY:
  - Passwords are hashed with bcrypt before storage.
  - hashed_password is never returned to callers.
"""

from __future__ import annotations

import logging
from typing import Any

from fastapi import Depends
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.classroom import Classroom, ClassroomCreate
from app.models.school import School, SchoolCreate
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.error_handling import ConflictError, NotFoundError, ValidationError
from app.repositories.classroom_repository import ClassroomRepository
from app.repositories.ivr_repository import IVRRepository
from app.repositories.school_repository import SchoolRepository
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


class SchoolService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:  # type: ignore[type-arg]
        self._db = db
        self._repo = SchoolRepository(db)
        self._user_repo = UserRepository(db)
        self._class_repo = ClassroomRepository(db)
        self._ivr_repo = IVRRepository(db)

    # ------------------------------------------------------------------
    # School CRUD
    # ------------------------------------------------------------------

    async def get_school(self, school_id: str) -> School:
        """Fetch a school by its _id. Raises NotFoundError when not found."""
        school = await self._repo.find_by_id(school_id)
        if school is None:
            raise NotFoundError("School", school_id)
        return school

    async def create_school(
        self,
        name: str,
        email: str,
        tenant_id: str,
        plain_password: str,
    ) -> School:
        """Create a school, hashing the plain-text password before storage.

        Raises ConflictError if email already taken.
        """
        if await self._repo.find_by_email(email) is not None:
            raise ConflictError(f"School with email {email}")

        data = SchoolCreate(
            tenant_id=tenant_id,
            name=name.strip(),
            email=email.strip(),
            password=hash_password(plain_password),
            is_active=True,
        )
        return await self._repo.create(data)

    async def update_school(self, school_id: str, updates: dict[str, Any]) -> School:
        """Apply partial updates to a school document. Raises NotFoundError if not found."""
        if await self._repo.find_by_id(school_id) is None:
            raise NotFoundError("School", school_id)
        updated = await self._repo.update(school_id, updates)
        if updated is None:
            raise NotFoundError("School", school_id)
        return updated

    async def get_school_by_tenant(self, tenant_id: str) -> School | None:
        """Return the first school belonging to *tenant_id*, or None."""
        schools = await self._repo.find_all_by_tenant(tenant_id)
        return schools[0] if schools else None

    async def list_schools_by_tenant(self, tenant_id: str) -> list[School]:
        """Return all schools belonging to *tenant_id*."""
        return await self._repo.find_all_by_tenant(tenant_id)

    async def delete_school(self, school_id: str, tenant_id: str) -> bool:
        """Delete a school after validating it has no teachers/students.

        Raises NotFoundError if not found. Raises ValidationError if still has members.
        """
        school = await self._repo.find_by_id(school_id)
        if school is None or school.tenant_id != tenant_id:
            raise NotFoundError("School", school_id)

        if await self._user_repo.count_by_school_and_role(school_id, "teacher") > 0:
            raise ValidationError("School has teachers — remove them before deleting")
        if await self._user_repo.count_by_school_and_role(school_id, "student") > 0:
            raise ValidationError("School has students — remove them before deleting")

        return await self._repo.delete(school_id)

    async def get_school_dashboard(self, school_id: str, tenant_id: str) -> dict[str, Any]:
        """Return summary counts for a school's dashboard."""
        school = await self._repo.find_by_id(school_id)
        if school is None or school.tenant_id != tenant_id:
            raise NotFoundError("School", school_id)

        teacher_count = await self._user_repo.count_by_school_and_role(school_id, "teacher")
        student_count = await self._user_repo.count_by_school_and_role(school_id, "student")
        class_count = await self._class_repo.count_by_school(school_id)
        school_data = school.model_dump(by_alias=True, exclude_none=True)
        school_data.pop("hashed_password", None)
        return {
            "school": school_data,
            "teachers": teacher_count,
            "students": student_count,
            "classes": class_count,
        }

    async def get_school_analytics(
        self, school_id: str, start_iso: str, end_iso: str
    ) -> list[dict[str, Any]]:
        """Return ivrv2logs for *school_id* within [start_iso, end_iso] ISO range."""
        return await self._ivr_repo.find_logs_by_school_date_range(school_id, start_iso, end_iso)

    async def list_teachers_by_school(
        self, school_id: str, tenant_id: str
    ) -> list[dict[str, Any]]:
        """Return all teachers and content_creators for a given school."""
        users = await self._user_repo.find_by_school(school_id)
        return [
            {
                "_id": str(u.id),
                "name": u.name,
                "phoneNumber": u.phone,
                "role": u.role.value,
            }
            for u in users
            if u.role.value in ("teacher", "content_creator")
        ]

    async def transfer_teacher(
        self, teacher_id: str, target_school_id: str
    ) -> dict[str, Any]:
        """Transfer a teacher to another school. Returns the updated user (no password)."""
        teacher = await self._user_repo.find_by_id(teacher_id)
        if teacher is None:
            raise NotFoundError("Teacher", teacher_id)

        if await self._repo.find_by_id(target_school_id) is None:
            raise NotFoundError("School", target_school_id)

        updated = await self._user_repo.update(teacher_id, {"school_id": target_school_id})
        if updated is None:
            raise NotFoundError("Teacher", teacher_id)

        safe = updated.model_dump(by_alias=True, exclude_none=True)
        safe.pop("hashed_password", None)
        return safe

    # ------------------------------------------------------------------
    # Classroom CRUD
    # ------------------------------------------------------------------

    async def create_classroom(self, data: ClassroomCreate) -> Classroom:
        return await self._class_repo.create(data)

    async def get_classroom(self, classroom_id: str) -> Classroom:
        """Fetch a classroom by its _id. Raises NotFoundError when not found."""
        classroom = await self._class_repo.find_by_id(classroom_id)
        if classroom is None:
            raise NotFoundError("Classroom", classroom_id)
        return classroom

    async def update_classroom(
        self, classroom_id: str, updates: dict[str, Any]
    ) -> Classroom:
        """Apply partial updates to a classroom. Raises NotFoundError if not found."""
        if await self._class_repo.find_by_id(classroom_id) is None:
            raise NotFoundError("Classroom", classroom_id)
        updated = await self._class_repo.update(classroom_id, updates)
        if updated is None:
            raise NotFoundError("Classroom", classroom_id)
        return updated

    async def list_classrooms_by_school(self, school_id: str) -> list[Classroom]:
        return await self._class_repo.find_by_school(school_id)

    async def list_classrooms_by_teacher(self, teacher_id: str) -> list[Classroom]:
        return await self._class_repo.find_by_teacher(teacher_id)

    async def delete_classroom(self, classroom_id: str) -> bool:
        """Delete a classroom by ID. Raises NotFoundError if not found."""
        if await self._class_repo.find_by_id(classroom_id) is None:
            raise NotFoundError("Classroom", classroom_id)
        return await self._class_repo.delete(classroom_id)


def get_school_service(
    db: AsyncIOMotorDatabase[Any] = Depends(get_db),  # type: ignore[type-arg]
) -> SchoolService:
    return SchoolService(db)
