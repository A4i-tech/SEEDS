"""Response DTO for classroom endpoints.

Decouples the API response shape from the DB domain model (Classroom).
Field names and the wire format are snake_case end-to-end.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.classroom import Classroom
from app.models.user import User


class ClassMemberResponse(BaseModel):
    id: str
    name: str
    phone_number: str | None = None

    @classmethod
    def from_domain(cls, user: User) -> ClassMemberResponse:
        return cls(id=str(user.id), name=user.name, phone_number=user.phone)


class ClassroomDetailResponse(BaseModel):
    """GET /class/{id} response — students and leaders hydrated into objects."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None
    school_id: str
    name: str
    teacher: str
    students: list[ClassMemberResponse] = []
    leaders: list[ClassMemberResponse] = []
    content_ids: list[str] = []
    created_at: datetime | None = Field(None)
    updated_at: datetime | None = Field(None)

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)


class ClassroomResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None
    school_id: str
    name: str
    teacher: str
    students: list[str] = []
    leaders: list[str] = []
    content_ids: list[str] = []
    created_at: datetime | None = Field(None)
    updated_at: datetime | None = Field(None)

    @classmethod
    def from_domain(cls, classroom: Classroom) -> ClassroomResponse:
        return cls(
            id=classroom.id,
            school_id=classroom.school_id,
            name=classroom.name,
            teacher=classroom.teacher,
            students=classroom.students,
            leaders=classroom.leaders,
            content_ids=classroom.content_ids,
            created_at=classroom.created_at,
            updated_at=classroom.updated_at,
        )

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)
