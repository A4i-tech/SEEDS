"""Shared user refresh-token model (teacher/tenant/school_admin)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict


class UserRefreshToken(BaseModel):
    """Document in the 'userRefreshTokens' collection.

    Backs the shared refresh-token engine (``app.platform.auth.refresh_tokens``)
    for the user-facing auth flow — teacher/tenant/school_admin logins all
    persist here via the same rotation/reuse-detection algorithm the Content
    Aggregator flow uses.

    family_id links a refresh token to every token it was rotated from/into —
    reuse detection revokes the whole family, not just one token.
    claims is the JWT claims dict captured at issue time (role/tenant_id/
    school_id) so a rotated access token reissues the user's originally
    granted claims rather than re-deriving them from current state.
    """

    model_config = ConfigDict(populate_by_name=True)

    token_id: str
    owner_id: str
    family_id: str
    claims: dict[str, Any] = {}
    expires_at: datetime
    revoked: bool = False
    created_at: datetime | None = None

    @classmethod
    def from_mongo(cls, doc: dict) -> UserRefreshToken:
        return cls.model_validate(dict(doc))
