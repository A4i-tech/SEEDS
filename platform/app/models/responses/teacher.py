"""Response DTOs for user-related endpoints.

Maps platform User (snake_case domain) → API wire format.

UserPublicResponse matches user.model_dump(by_alias=True, exclude_none=True) minus
hashed_password and firebase_uid. The User model has no camelCase aliases (only
_id), so all fields are snake_case except _id — matching PR #237's staging shape.

Sensitive fields excluded: hashed_password, firebase_uid, encrypted_phone_number,
encryption_iv, encryption_salt.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class TeacherTransferResponse(BaseModel):
    """Safe user representation for login, profile, register, and update responses.

    Output shape matches user.model_dump(by_alias=True) on the User domain model:
    snake_case for all fields except _id (User model only aliases id → _id).
    """

    message: str
    teacher: dict[str, Any]
