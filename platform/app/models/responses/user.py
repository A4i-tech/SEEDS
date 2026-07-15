"""Response DTOs for user-related endpoints.

Maps platform User (snake_case domain) → API wire format.

UserPublicResponse matches user.model_dump(exclude_none=True) minus
hashed_password and firebase_uid — snake_case end-to-end.

Sensitive fields excluded: hashed_password, firebase_uid, encrypted_phone_number,
encryption_iv, encryption_salt.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.models.user import User


class UserPublicResponse(BaseModel):
    """Safe user representation for login, profile, register, and update responses."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = None
    role: str
    name: str
    email: str | None = None
    phone_number: str | None = None
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
        return self.model_dump(exclude_none=True)
