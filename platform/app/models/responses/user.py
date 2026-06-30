"""Response DTOs for user-related endpoints.

Maps platform User (snake_case domain) → API wire format.

UserPublicResponse matches user.model_dump(by_alias=True, exclude_none=True) minus
hashed_password and firebase_uid. The User model has no camelCase aliases (only
_id), so all fields are snake_case except _id — matching PR #237's staging shape.

Sensitive fields excluded: hashed_password, firebase_uid, encrypted_phone_number,
encryption_iv, encryption_salt.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.models.user import User


class UserPublicResponse(BaseModel):
    """Safe user representation for login, profile, register, and update responses.

    All fields use camelCase aliases so to_response() emits the wire format the
    ContentWebApp expects (phoneNumber, tenantName, schoolId, etc.).
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    role: str
    name: str
    email: str | None = None
    phone_number: str | None = Field(None, alias="phoneNumber")
    tenant_id: str | None = Field(None, alias="tenantId")
    school_id: str | None = Field(None, alias="schoolId")
    tenant_name: str | None = Field(None, alias="tenantName")
    organisation: str | None = None
    language_preference: str | None = Field(None, alias="languagePreference")
    is_active: bool = Field(True, alias="isActive")
    created_at: datetime | None = Field(None, alias="createdAt")
    updated_at: datetime | None = Field(None, alias="updatedAt")

    @classmethod
    def from_domain(cls, user: User) -> UserPublicResponse:
        return cls(
            id=user.id,
            role=user.role.value if hasattr(user.role, "value") else str(user.role),
            name=user.name,
            email=user.email,
            phone_number=user.phone,
            tenant_id=user.tenant_id,
            school_id=user.school_id,
            tenant_name=user.tenant_name,
            organisation=user.organisation,
            language_preference=user.language_preference,
            is_active=user.is_active,
            created_at=user.created_at,
            updated_at=user.updated_at,
        )

    def to_response(self) -> dict:
        return self.model_dump(by_alias=True, exclude_none=True)
