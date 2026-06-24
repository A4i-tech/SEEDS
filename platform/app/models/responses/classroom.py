"""Response DTO for classroom endpoints.

Decouples the API response shape from the DB domain model (Classroom).
Field aliases match the legacy Mongoose document keys so the wire format
is identical to what classRouter.js returned.
"""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.classroom import Classroom


class ClassroomResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    school_id: str = Field(..., alias="schoolId")
    name: str
    teacher: str
    students: list[str] = Field(default_factory=list)
    leaders: list[str] = Field(default_factory=list)
    content_ids: list[str] = Field(default_factory=list, alias="contentIds")
    created_at: datetime | None = Field(None, alias="createdAt")
    updated_at: datetime | None = Field(None, alias="updatedAt")

    @classmethod
    def from_domain(cls, classroom: Classroom) -> ClassroomResponse:
        return cls.model_validate(classroom.model_dump(by_alias=True))

    def to_response(self) -> dict:
        return self.model_dump(by_alias=True, exclude_none=True)
