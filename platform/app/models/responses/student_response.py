"""Response DTO for student endpoints.

Fields: id, name, phone_number, school_id — snake_case end-to-end.
"""

from __future__ import annotations

from pydantic import BaseModel

from app.models.user import User


class StudentResponse(BaseModel):
    id: str | None = None
    name: str
    phone_number: str | None = None
    school_id: str | None = None

    @classmethod
    def from_domain(cls, user: User) -> StudentResponse:
        return cls(
            id=user.id,
            name=user.name,
            phone_number=user.phone,
            school_id=user.school_id,
        )

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)
