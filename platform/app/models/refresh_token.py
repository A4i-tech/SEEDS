"""Shared user refresh-token model (teacher/tenant/school_admin)."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict


class UserTokenClaims(BaseModel):
    """Claims carried on a user (teacher/tenant/school_admin) refresh token."""

    model_config = ConfigDict(populate_by_name=True)

    role: str
    tenant_id: str | None = None
    school_id: str | None = None


class UserRefreshToken(BaseModel):
    """Document in the 'userRefreshTokens' collection."""

    model_config = ConfigDict(populate_by_name=True)

    token_id: str
    owner_id: str
    claims: UserTokenClaims
    expires_at: datetime
    revoked: bool = False
    created_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict) -> UserRefreshToken:
        return cls.model_validate(dict(doc))
