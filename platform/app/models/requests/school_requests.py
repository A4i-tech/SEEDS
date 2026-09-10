"""Request schemas and create DTOs for school and classroom endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field, field_validator


class SchoolCreateRequest(BaseModel):
    name: str
    email: str
    password: str


class SchoolUpdateRequest(BaseModel):
    name: str | None = None
    email: str | None = None
    password: str | None = None


class TeacherTransferRequest(BaseModel):
    teacher_id: str
    target_school_id: str


class SchoolAnalyticsRequest(BaseModel):
    start_date: str
    end_date: str


class ClassroomUpsertRequest(BaseModel):
    id: str | None = None
    name: str
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    content_ids: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}

    @field_validator("name")
    @classmethod
    def _strip_name(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Class name cannot be blank. Enter a name for the class, then try again.")
        return stripped


class ClassroomCreate(BaseModel):
    """Snake_case create DTO — model_dump() writes correct DB keys directly."""

    school_id: str
    name: str
    teacher: str
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    content_ids: list[str] = Field(default_factory=list)


class SchoolCreate(BaseModel):
    """Snake_case create DTO — model_dump() writes correct DB keys directly."""

    tenant_id: str
    name: str
    email: str
    password: str | None = None
    is_active: bool = True
