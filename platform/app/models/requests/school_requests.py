"""Request schemas for school and classroom endpoints."""
from __future__ import annotations

from pydantic import Field

from app.models.base import BaseDocument


class SchoolCreateRequest(BaseDocument):
    name: str
    email: str
    password: str


class SchoolUpdateRequest(BaseDocument):
    name: str | None = None
    email: str | None = None
    password: str | None = None


class TeacherTransferRequest(BaseDocument):
    teacher_id: str         # alias: teacherId
    target_school_id: str   # alias: targetSchoolId


class SchoolAnalyticsRequest(BaseDocument):
    start_date: str         # alias: startDate
    end_date: str           # alias: endDate


class ClassroomUpsertRequest(BaseDocument):
    id: str | None = Field(None, alias="_id")
    name: str | None = None
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    content_ids: list[str] = Field(default_factory=list)  # alias: contentIds
