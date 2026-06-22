"""Request schemas for school and classroom endpoints."""
from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class SchoolCreateRequest(BaseModel):
    name: str
    email: str
    password: str


class SchoolUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


class TeacherTransferRequest(BaseModel):
    teacher_id: str = Field(..., alias="teacherId")
    target_school_id: str = Field(..., alias="targetSchoolId")

    model_config = {"populate_by_name": True}


class SchoolAnalyticsRequest(BaseModel):
    start_date: str = Field(..., alias="startDate")
    end_date: str = Field(..., alias="endDate")

    model_config = {"populate_by_name": True}


class ClassroomUpsertRequest(BaseModel):
    id: Optional[str] = Field(None, alias="_id")
    name: Optional[str] = None
    students: List[str] = Field(default_factory=list)
    leaders: List[str] = Field(default_factory=list)
    content_ids: List[str] = Field(default_factory=list, alias="contentIds")

    model_config = {"populate_by_name": True}
