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

from app.models.classroom import Classroom
from app.models.requests.school_requests import ClassroomCreate, SchoolUpdateRequest
from app.models.responses.classroom import ClassMemberResponse, ClassroomDetailResponse
from app.models.responses.school_response import (
    SchoolDashboardResponse,
    SchoolResponse,
    SchoolTeacherResponse,
)
from app.models.user import User, UserCreate, UserRole
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.error_handling import ConflictError, NotFoundError, ValidationError
from app.repositories.classroom_repository import ClassroomRepository
from app.repositories.ivr_repository import IVRRepository
from app.repositories.user_repository import UserRepository

logger = logging.getLogger(__name__)


class SchoolService:
    def __init__(self, db: AsyncIOMotorDatabase[Any]) -> None:  # type: ignore[type-arg]
        self._db = db
        self._user_repo = UserRepository(db)
        self._class_repo = ClassroomRepository(db)
        self._ivr_repo = IVRRepository(db)

    # ------------------------------------------------------------------
    # School CRUD — schools are school_admin users in the unified 'users'
    # collection (role="school_admin"), not a separate collection.
    # ------------------------------------------------------------------

    async def _find_school(self, school_id: str, tenant_id: str) -> User | None:
        """Fetch a school_admin user by id, scoped to tenant_id and role."""
        school = await self._user_repo.find_by_id(school_id)
        if school is None or school.role != UserRole.SCHOOL_ADMIN or school.tenant_id != tenant_id:
            return None
        return school

    async def get_school(self, school_id: str, tenant_id: str) -> User:
        """Fetch a school by ID, scoped to tenant_id. Raises NotFoundError when not found or tenant mismatch."""
        school = await self._find_school(school_id, tenant_id)
        if school is None:
            raise NotFoundError("School", school_id)
        return school

    async def create_school(
        self,
        name: str,
        email: str,
        tenant_id: str,
        plain_password: str,
    ) -> User:
        """Create a school_admin user representing a school.

        Raises ConflictError if email already taken.
        """
        if await self._user_repo.find_by_email_and_role(email, UserRole.SCHOOL_ADMIN.value) is not None:
            raise ConflictError(f"School with email {email}")

        hashed = hash_password(plain_password)

        school = await self._user_repo.create(
            UserCreate(
                role=UserRole.SCHOOL_ADMIN,
                name=name.strip(),
                email=email.strip(),
                hashed_password=hashed,
                tenant_id=tenant_id,
                is_active=True,
            )
        )

        # A school_admin's own school_id self-references its user id.
        updated = await self._user_repo.update(school.id, {"school_id": school.id})
        return updated or school

    async def update_school(
        self, school_id: str, body: SchoolUpdateRequest, tenant_id: str
    ) -> User:
        """Apply partial updates to a school (school_admin user)."""
        if await self._find_school(school_id, tenant_id) is None:
            raise NotFoundError("School", school_id)

        updates: dict[str, Any] = {}
        if body.name:
            updates["name"] = body.name.strip()
        if body.email:
            updates["email"] = body.email.strip()
        if body.password:
            updates["hashed_password"] = hash_password(body.password)

        updated = await self._user_repo.update(school_id, updates)
        if updated is None:
            raise NotFoundError("School", school_id)
        return updated

    async def get_school_by_tenant(self, tenant_id: str) -> User | None:
        """Return the first school belonging to *tenant_id*, or None."""
        schools = await self.list_schools_by_tenant(tenant_id)
        return schools[0] if schools else None

    async def list_schools_by_tenant(self, tenant_id: str) -> list[User]:
        """Return all schools belonging to *tenant_id*."""
        return await self._user_repo.find_all_by_tenant_and_role(tenant_id, UserRole.SCHOOL_ADMIN.value)

    async def delete_school(self, school_id: str, tenant_id: str) -> bool:
        """Delete a school after validating it has no teachers/students.

        Raises NotFoundError if not found. Raises ValidationError if still has members.
        """
        if await self._find_school(school_id, tenant_id) is None:
            raise NotFoundError("School", school_id)

        if await self._user_repo.count_by_school_and_role(school_id, "teacher") > 0:
            raise ValidationError("School has teachers — remove them before deleting")
        if await self._user_repo.count_by_school_and_role(school_id, "student") > 0:
            raise ValidationError("School has students — remove them before deleting")

        return await self._user_repo.delete(school_id)

    async def get_school_dashboard(self, school_id: str, tenant_id: str) -> SchoolDashboardResponse:
        """Return summary counts for a school's dashboard."""
        school = await self._find_school(school_id, tenant_id)
        if school is None:
            raise NotFoundError("School", school_id)

        teacher_count = await self._user_repo.count_by_school_and_role(school_id, "teacher")
        student_count = await self._user_repo.count_by_school_and_role(school_id, "student")
        class_count = await self._class_repo.count_by_school(school_id)
        return SchoolDashboardResponse(
            school=SchoolResponse.from_domain(school),
            teachers=teacher_count,
            students=student_count,
            classes=class_count,
        )

    async def get_school_analytics(
        self, school_id: str, start_iso: str, end_iso: str
    ) -> list[dict[str, Any]]:
        """Return ivrv2logs for *school_id* within [start_iso, end_iso] ISO range."""
        return await self._ivr_repo.find_logs_by_school_date_range(school_id, start_iso, end_iso)

    async def list_teachers_by_school(self, school_id: str, tenant_id: str) -> list[SchoolTeacherResponse]:
        """Return all teachers and content_creators for a given school."""
        all_users = await self._user_repo.find_all_by_tenant(tenant_id)
        return [
            SchoolTeacherResponse(id=str(u.id), name=u.name, phone_number=u.phone, role=u.role.value)
            for u in all_users
            if u.school_id == school_id and u.role.value in ("teacher", "content_creator")
        ]

    async def transfer_teacher(
        self, teacher_id: str, target_school_id: str, caller_tenant_id: str
    ) -> User:
        """Transfer a teacher to another school within the same tenant. Returns the updated User domain object."""
        teacher = await self._user_repo.find_by_id(teacher_id)
        if teacher is None:
            raise NotFoundError("Teacher", teacher_id)

        if teacher.tenant_id != caller_tenant_id:
            raise NotFoundError("Teacher", teacher_id)

        target_school = await self._find_school(target_school_id, caller_tenant_id)
        if target_school is None:
            raise NotFoundError("School", target_school_id)

        updated = await self._user_repo.update(teacher_id, {"school_id": target_school_id})
        if updated is None:
            raise NotFoundError("Teacher", teacher_id)

        return updated

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

    async def get_classroom_detail(self, classroom_id: str) -> ClassroomDetailResponse:
        """Fetch classroom with students and leaders hydrated into member objects."""
        classroom = await self.get_classroom(classroom_id)

        all_ids = list(set(classroom.students) | set(classroom.leaders))
        users_by_id = {
            str(u.id): u
            for u in await self._user_repo.find_many_by_ids(all_ids)
        }

        def _member(uid: str) -> ClassMemberResponse | None:
            u = users_by_id.get(uid)
            return ClassMemberResponse.from_domain(u) if u else None

        return ClassroomDetailResponse(
            id=classroom.id,
            school_id=classroom.school_id,
            name=classroom.name,
            teacher=classroom.teacher,
            students=[m for uid in classroom.students if (m := _member(uid))],
            leaders=[m for uid in classroom.leaders if (m := _member(uid))],
            content_ids=classroom.content_ids,
            created_at=classroom.created_at,
            updated_at=classroom.updated_at,
        )

    async def update_classroom(self, classroom_id: str, updates: dict[str, Any]) -> Classroom:
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
