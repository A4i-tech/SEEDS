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

from app.models.content_aggregator import IntegrationTokenType
from app.platform.auth.hashing import verify_password
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.platform.telemetry import get_counter
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
            family_id=refresh_token,  # root of a new token family
            tenant_id=client.tenant_id,
            scopes=requested_scopes,
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

    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        """Exchange a refresh token for a new access + refresh token pair.

        Single-use rotation: the presented token is atomically claimed
        (revoked=False -> True in one update) as part of a successful
        refresh, so two concurrent requests for the same token can never
        both win — the loser is treated as reuse. Replaying any
        already-consumed token (whether by a prior rotation or a losing
        concurrent request) revokes the entire token family and logs/counts
        a security event.

        Raises:
            UnauthorizedError: token unknown, wrong type, already
                consumed/revoked (including the losing side of a race), or
                the owning client is no longer active — one generic 401
                body, no distinction, to avoid enumeration/leaking replay
                detection.
            AppError(code="REFRESH_TOKEN_EXPIRED"): token exists, was
                successfully claimed, but was already past its expiry —
                intentionally distinct per spec.
        """
        consumed = await self._tokens.try_consume(refresh_token)

        if consumed is None or consumed.type != IntegrationTokenType.REFRESH:
            # Either unknown, or already consumed (prior rotation / genuine
            # replay / a losing concurrent request racing this same token).
            # Look up read-only, purely to attribute the reuse-detection
            # event — the response itself never distinguishes the cases.
            existing = await self._tokens.find_by_token_id(refresh_token)
            if existing is not None and existing.type == IntegrationTokenType.REFRESH:
                logger.warning(
                    "content_aggregator auth: revoked refresh token replayed — client_id=%s",
                    existing.client_id,
                    extra={
                        "event": "refresh_token_reuse_detected",
                        "client_id": existing.client_id,
                        "family_id": existing.family_id,
                    },
                )
                get_counter("content_aggregator_auth.reuse_detected").add(
                    1, {"client_id": existing.client_id}
                )
                await self._tokens.revoke_family(existing.client_id, existing.family_id)
            raise UnauthorizedError("Invalid refresh token")

        now = datetime.now(tz=UTC)
        expires_at = consumed.expires_at
        if expires_at.tzinfo is None:
            # Mongo round-trips datetimes as naive UTC — normalize before comparing.
            expires_at = expires_at.replace(tzinfo=UTC)
        if expires_at <= now:
            raise AppError("REFRESH_TOKEN_EXPIRED", "Refresh token has expired", 401)

        client = await self._clients.find_by_client_id(consumed.client_id)
        if client is None or client.status != "active":
            raise AppError("TENANT_NOT_ALLOWED", "Client is not active", 403)

        access_token, expires_in = _jwt.encode_access_token(
            client_id=client.client_id,
            tenant_id=consumed.tenant_id,
            scopes=consumed.scopes,
            secret_key=self._settings.secret_key,
            expires_in=self._settings.content_aggregator_access_token_expires_in,
        )

        new_refresh_token = _jwt.generate_refresh_token()
        await self._tokens.insert_refresh_token(
            token_id=new_refresh_token,
            client_id=client.client_id,
            family_id=consumed.family_id,
            tenant_id=consumed.tenant_id,
            scopes=consumed.scopes,
            expires_at=_jwt.refresh_token_expiry(
                self._settings.content_aggregator_refresh_token_expires_in
            ),
            created_at=now,
        )

        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "expires_in": expires_in,
            "token_type": "Bearer",
        }

    async def admin_revoke_client(self, client_id: str) -> None:
        """Internal-only: revoke every token for *client_id*, across all families.

        Function-level only — deliberately not exposed as an HTTP route (#459
        explicitly asks to confirm with the team before adding a new admin
        route). Callable from a Python shell, ops script, or future internal
        tooling.
        """
        await self._tokens.revoke_all_for_client(client_id)
