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

    Output shape matches user.model_dump(by_alias=True) on the User domain model:
    snake_case for all fields except _id (User model only aliases id → _id).
    """
    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    role: str
    name: str
    email: str | None = None
    phone: str | None = None
    tenant_id: str | None = None
    school_id: str | None = None
    tenant_name: str | None = None
    organisation: str | None = None
    language_preference: str | None = None
    is_active: bool = True
    created_at: datetime | None = None
    updated_at: datetime | None = None

    @classmethod
    def from_domain(cls, user: User) -> UserPublicResponse:
        return cls(
            id=user.id,
            role=user.role.value if hasattr(user.role, "value") else str(user.role),
            name=user.name,
            email=user.email,
            phone=user.phone,
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
        return self.model_dump(exclude_none=True)


class TenantProfileResponse(BaseModel):
    """Response DTO for GET /tenant/me."""

    id: str
    email: str | None = None
    tenant_name: str

    @classmethod
    def from_domain(cls, user: User) -> TenantProfileResponse:
        return cls(id=str(user.id), email=user.email, tenant_name=user.name)

    def to_response(self) -> dict:
        return self.model_dump(exclude_none=True)
