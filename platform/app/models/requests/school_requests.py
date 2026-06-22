"""Request schemas for school and classroom endpoints."""
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
    teacher_id: str = Field(..., alias="teacherId")
    target_school_id: str = Field(..., alias="targetSchoolId")

    model_config = {"populate_by_name": True}


class SchoolAnalyticsRequest(BaseModel):
    start_date: str = Field(..., alias="startDate")
    end_date: str = Field(..., alias="endDate")

    model_config = {"populate_by_name": True}


class ClassroomUpsertRequest(BaseModel):
    id: str | None = Field(None, alias="_id")
    name: str | None = None
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    content_ids: list[str] = Field(default_factory=list, alias="contentIds")

    model_config = {"populate_by_name": True}
