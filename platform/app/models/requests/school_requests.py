"""Request schemas and create DTOs for school and classroom endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field


class SchoolCreateRequest(BaseModel):
    name: str
    email: str
    password: str


class SchoolUpdateRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None


class TeacherTransferRequest(BaseModel):
    teacherId: str
    targetSchoolId: str

    model_config = {"populate_by_name": True}


class SchoolAnalyticsRequest(BaseModel):
    startDate: str
    endDate: str

    model_config = {"populate_by_name": True}


class ClassroomUpsertRequest(BaseModel):
    id: str | None = None
    name: str | None = None
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    contentIds: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}


class ClassroomCreate(BaseModel):
    """CamelCase create DTO — model_dump() writes correct DB keys directly."""

    schoolId: str
    name: str
    teacher: str
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    contentIds: list[str] = Field(default_factory=list)


class SchoolCreate(BaseModel):
    """CamelCase create DTO — model_dump() writes correct DB keys directly."""

    tenantId: str
    name: str
    email: str
    password: str | None = None
    isActive: bool = True
