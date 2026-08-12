"""Shared user refresh-token model (teacher/tenant/school_admin)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class UserRefreshToken(BaseModel):
    """Document in the 'userRefreshTokens' collection."""

    model_config = ConfigDict(populate_by_name=True)

    token_id: str
    owner_id: str
    family_id: str
    claims: dict[str, Any] = {}
    expires_at: datetime
    revoked: bool = False
    created_at: datetime

    @classmethod
    def from_mongo(cls, doc: dict) -> UserRefreshToken:
        return cls.model_validate(dict(doc))
