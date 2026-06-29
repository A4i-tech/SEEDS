"""Response DTO for classroom endpoints — snake_case wire format."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.classroom import Classroom


class ClassroomResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    school_id: str
    name: str
    teacher: str
    students: list[str] = []
    leaders: list[str] = []
    content_ids: list[str] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_domain(cls, classroom: Classroom) -> ClassroomResponse:
        return cls.model_validate(classroom.model_dump())

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)
