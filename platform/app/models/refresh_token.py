from __future__ import annotations

from datetime import datetime
from typing import TypedDict

from pydantic import BaseModel, ConfigDict


class UserClaims(TypedDict):
    role: str
    tenant_id: str | None
    school_id: str | None


class UserTokenClaims(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    role: str
    tenant_id: str | None = None
    school_id: str | None = None


class UserRefreshToken(BaseModel):
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
