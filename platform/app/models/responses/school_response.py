"""Response DTO for school endpoints.

Schools are school_admin users in the unified 'users' collection (role="school_admin").
Password is excluded at the DTO level — never in API responses.
Fields: id, tenant_id, name, email, is_active, created_at, updated_at.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel

from app.models.user import User


class SchoolResponse(BaseModel):
    id: str | None = None
    tenant_id: str | None = None
    name: str
    email: str | None = None
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_domain(cls, school: User) -> SchoolResponse:
        return cls(
            id=school.id,
            tenant_id=school.tenant_id,
            name=school.name,
            email=school.email,
            is_active=school.is_active,
            created_at=school.created_at,
            updated_at=school.updated_at,
        )

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)


class SchoolTeacherResponse(BaseModel):
    """A teacher/content_creator row in GET /school/teachers."""

    id: str
    name: str
    phone_number: str | None = None
    role: str


class SchoolDashboardResponse(BaseModel):
    """GET /school/dashboard."""

    school: SchoolResponse
    teachers: int
    students: int
    classes: int
