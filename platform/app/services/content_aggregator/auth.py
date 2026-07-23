"""Content Aggregator partner auth — the only file (besides ``_jwt.py``) that
touches JWT internals. Controllers/services must only call
``ContentAggregatorAuth.issue_token`` / ``.verify_token``.

SECURITY: client_secret and issued tokens are never logged.
"""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.hashing import verify_password
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.repositories.integration_client_repository import IntegrationClientRepository
from app.repositories.integration_token_repository import IntegrationTokenRepository
from app.services.content_aggregator import _jwt

logger = logging.getLogger(__name__)


class ContentAggregatorAuth:
    """Issues and verifies partner JWTs for the Content Aggregator API."""

    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        settings: Settings,
    ) -> None:
        self._clients = IntegrationClientRepository(db)
        self._tokens = IntegrationTokenRepository(db)
        self._settings = settings

    async def issue_token(
        self,
        client_id: str,
        client_secret: str,
        tenant_id: str | None = None,
        scopes: list[str] | None = None,
    ) -> dict[str, Any]:
        """Exchange client_id/client_secret for an access + refresh token.

        Raises:
            UnauthorizedError: unknown client_id or wrong secret (401, no
                distinction in the response — avoids user enumeration).
            AppError(code="TENANT_NOT_ALLOWED"): client disabled, or the
                requested tenant_id doesn't match the client's own tenant_id.
            AppError(code="SCOPE_INSUFFICIENT"): requested scopes exceed the
                client's allowed_scopes.
        """
        client = await self._clients.find_by_client_id(client_id)
        if client is None or not verify_password(client_secret, client.client_secret_hash):
            logger.warning("content_aggregator auth: invalid credentials for client_id=%s", client_id)
            raise UnauthorizedError("Invalid client credentials")

        if client.status != "active":
            raise AppError("TENANT_NOT_ALLOWED", "Client is not active", 403)

        if tenant_id is not None and tenant_id != client.tenant_id:
            raise AppError("TENANT_NOT_ALLOWED", "Client is not scoped to the requested tenant", 403)

        requested_scopes = scopes if scopes is not None else list(client.allowed_scopes)
        if not set(requested_scopes).issubset(client.allowed_scopes):
            raise AppError("SCOPE_INSUFFICIENT", "Requested scopes exceed allowed scopes", 403)

        access_token, expires_in = _jwt.encode_access_token(
            client_id=client.client_id,
            tenant_id=client.tenant_id,
            scopes=requested_scopes,
            secret_key=self._settings.secret_key,
            expires_in=self._settings.content_aggregator_access_token_expires_in,
        )

        refresh_token = _jwt.generate_refresh_token()
        now = datetime.now(tz=UTC)
        await self._tokens.insert_refresh_token(
            token_id=refresh_token,
            client_id=client.client_id,
            expires_at=_jwt.refresh_token_expiry(
                self._settings.content_aggregator_refresh_token_expires_in
            ),
            created_at=now,
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "expires_in": expires_in,
            "token_type": "Bearer",
        }

    async def verify_token(self, token: str) -> dict[str, Any]:
        """Verify and decode an access token. Raises UnauthorizedError on failure."""
        return _jwt.decode_access_token(token, secret_key=self._settings.secret_key)
