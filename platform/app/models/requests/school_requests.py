"""Request schemas and create DTOs for school and classroom endpoints."""

from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


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
    name: str | None = None
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    content_ids: list[str] = Field(default_factory=list)

    model_config = {"populate_by_name": True}

    @model_validator(mode="after")
    def _require_name_and_students_on_create(self) -> ClassroomUpsertRequest:
        """Only enforced for create (id is None) — update is a partial patch."""
        if self.id is None:
            if not (self.name or "").strip():
                raise ValueError("name is required")
            if not self.students:
                raise ValueError("at least one student is required")
        return self


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
