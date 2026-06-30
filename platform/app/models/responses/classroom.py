"""Response DTO for classroom endpoints.

Decouples the API response shape from the DB domain model (Classroom).
Field aliases match the legacy Mongoose document keys so the wire format
is identical to what classRouter.js returned.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.classroom import Classroom
from app.models.user import User


class ClassMemberResponse(BaseModel):
    id: str
    name: str
    phoneNumber: str | None = None

    @classmethod
    def from_domain(cls, user: User) -> ClassMemberResponse:
        return cls(id=str(user.id), name=user.name, phoneNumber=user.phone)


class ClassroomDetailResponse(BaseModel):
    """GET /class/{id} response — students and leaders hydrated into objects."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None
    school_id: str
    name: str
    teacher: str
    students: list[ClassMemberResponse] = []
    leaders: list[ClassMemberResponse] = []
    contentIds: list[str] = []
    createdAt: datetime | None = Field(None, alias="createdAt")
    updatedAt: datetime | None = Field(None, alias="updatedAt")

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
    contentIds: list[str] = []
    createdAt: datetime | None = Field(None, alias="createdAt")
    updatedAt: datetime | None = Field(None, alias="updatedAt")

    @classmethod
    def from_domain(cls, classroom: Classroom) -> ClassroomResponse:
        return cls(
            id=classroom.id,
            school_id=classroom.school_id,
            name=classroom.name,
            teacher=classroom.teacher,
            students=classroom.students,
            leaders=classroom.leaders,
            contentIds=classroom.content_ids,
            createdAt=classroom.created_at,
            updatedAt=classroom.updated_at,
        )

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)
