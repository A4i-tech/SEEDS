from __future__ import annotations

from app.models.content_aggregator import IntegrationClaims
from app.repositories.refresh_token_repository import RefreshTokenRepository


class IntegrationTokenRepository(RefreshTokenRepository[IntegrationClaims]):
    COLLECTION = "integrationTokens"
    REUSE_COUNTER = "content_aggregator_auth.reuse_detected"
