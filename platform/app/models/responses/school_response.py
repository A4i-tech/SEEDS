"""Response DTO for school endpoints.

Maps platform School (snake_case) → legacy School.js wire format (camelCase).
Password is excluded at the DTO level — never in API responses.
Legacy School.js fields: _id, tenantId, name, email, isActive, createdAt, updatedAt.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.school import School


class SchoolResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    tenantId: str
    name: str
    email: str
    isActive: bool = True
    createdAt: datetime | None = None
    updatedAt: datetime | None = None

    @classmethod
    def from_domain(cls, school: School) -> SchoolResponse:
        return cls.model_validate(
            {
                "_id": school.id,
                "tenantId": school.tenant_id,
                "name": school.name,
                "email": school.email,
                "isActive": school.is_active,
                "createdAt": school.created_at,
                "updatedAt": school.updated_at,
            }
        )

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)
