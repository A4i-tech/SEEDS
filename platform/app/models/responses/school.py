"""Response DTO for school endpoints — snake_case wire format."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.school import School


class SchoolResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    tenant_id: str
    name: str
    email: str
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_domain(cls, school: School) -> SchoolResponse:
        return cls(
            id=school.id,
            tenant_id=school.tenant_id,
            name=school.name,
            email=school.email,
            is_active=school.is_active,
            created_at=school.created_at,
            updated_at=school.updated_at,
        )

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)
