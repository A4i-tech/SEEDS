from __future__ import annotations

from app.models.refresh_token import UserClaims
from app.repositories.refresh_token_repository import RefreshTokenRepository


class UserRefreshTokenRepository(RefreshTokenRepository[UserClaims]):
    COLLECTION = "userRefreshTokens"
    REUSE_COUNTER = "auth.reuse_detected"
