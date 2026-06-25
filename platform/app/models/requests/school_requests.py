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
