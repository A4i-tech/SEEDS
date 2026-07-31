"""Content Aggregator partner auth — the only file (besides ``_jwt.py``) that
touches JWT internals. Controllers/services must only call
``ContentAggregatorAuth.issue_token`` / ``.verify_token``.

Refresh-token rotation/reuse-detection is delegated to the shared
``app.platform.auth.refresh_tokens`` engine via ``_IntegrationTokenStore``,
an adapter over the existing ``integrationTokens`` collection/schema — the
storage layer and its shape are unchanged from #458/#459.

SECURITY: client_secret and issued tokens are never logged.
"""
from __future__ import annotations

import logging
from datetime import datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.content_aggregator import IntegrationToken, IntegrationTokenType
from app.platform.auth import refresh_tokens
from app.platform.auth.hashing import verify_password
from app.platform.auth.refresh_tokens import ConsumedToken
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.repositories.integration_client_repository import IntegrationClientRepository
from app.repositories.integration_token_repository import IntegrationTokenRepository
from app.services.content_aggregator import _jwt

logger = logging.getLogger(__name__)


class _IntegrationTokenStore:
    """Adapts ``IntegrationTokenRepository`` to the shared ``RefreshTokenStore`` Protocol.

    Translates owner_id <-> client_id and claims <-> {tenant_id, scopes} so the
    legacy ``integrationTokens`` schema needs no changes.
    """

    def __init__(self, repo: IntegrationTokenRepository) -> None:
        self._repo = repo

    @staticmethod
    def _to_consumed(doc: IntegrationToken | None) -> ConsumedToken | None:
        if doc is None or doc.type != IntegrationTokenType.REFRESH:
            return None
        return ConsumedToken(
            owner_id=doc.client_id,
            family_id=doc.family_id,
            claims={"tenant_id": doc.tenant_id, "scopes": doc.scopes},
            expires_at=doc.expires_at,
        )

    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        family_id: str,
        claims: dict[str, Any],
        expires_at: datetime,
        created_at: datetime,
    ) -> None:
        await self._repo.insert_refresh_token(
            token_id=token_id,
            client_id=owner_id,
            family_id=family_id,
            tenant_id=claims["tenant_id"],
            scopes=claims["scopes"],
            expires_at=expires_at,
            created_at=created_at,
        )

    async def find_by_token_id(self, token_id: str) -> ConsumedToken | None:
        return self._to_consumed(await self._repo.find_by_token_id(token_id))

    async def try_consume(self, token_id: str) -> ConsumedToken | None:
        return self._to_consumed(await self._repo.try_consume(token_id))

    async def revoke_family(self, owner_id: str, family_id: str) -> None:
        await self._repo.revoke_family(owner_id, family_id)

    async def revoke_all_for_owner(self, owner_id: str) -> None:
        await self._repo.revoke_all_for_client(owner_id)


class ContentAggregatorAuth:
    """Issues and verifies partner JWTs for the Content Aggregator API."""

    def __init__(
        self,
        db: AsyncIOMotorDatabase,
        settings: Settings,
    ) -> None:
        self._clients = IntegrationClientRepository(db)
        self._store = _IntegrationTokenStore(IntegrationTokenRepository(db))
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

        return await refresh_tokens.issue_pair(
            self._store,
            owner_id=client.client_id,
            claims={"tenant_id": client.tenant_id, "scopes": requested_scopes},
            access_token=access_token,
            access_expires_in=expires_in,
            refresh_ttl=self._settings.content_aggregator_refresh_token_expires_in,
        )

    async def verify_token(self, token: str) -> dict[str, Any]:
        """Verify and decode an access token. Raises UnauthorizedError on failure."""
        return _jwt.decode_access_token(token, secret_key=self._settings.secret_key)

    async def refresh_token(self, refresh_token: str) -> dict[str, Any]:
        """Exchange a refresh token for a new access + refresh token pair.

        See ``app.platform.auth.refresh_tokens.rotate`` for the rotation/
        reuse-detection algorithm — this is a thin Content-Aggregator-specific
        wrapper supplying the owner-active check and access-token builder.
        """

        async def verify_owner_active(owner_id: str, claims: dict[str, Any]) -> dict[str, Any]:
            client = await self._clients.find_by_client_id(owner_id)
            if client is None or client.status != "active":
                raise AppError("TENANT_NOT_ALLOWED", "Client is not active", 403)
            return claims

        async def build_access_token(owner_id: str, claims: dict[str, Any]) -> tuple[str, int]:
            return _jwt.encode_access_token(
                client_id=owner_id,
                tenant_id=claims["tenant_id"],
                scopes=claims["scopes"],
                secret_key=self._settings.secret_key,
                expires_in=self._settings.content_aggregator_access_token_expires_in,
            )

        return await refresh_tokens.rotate(
            self._store,
            refresh_token,
            verify_owner_active=verify_owner_active,
            build_access_token=build_access_token,
            refresh_ttl=self._settings.content_aggregator_refresh_token_expires_in,
            reuse_counter_name="content_aggregator_auth.reuse_detected",
        )

    async def admin_revoke_client(self, client_id: str) -> None:
        """Internal-only: revoke every token for *client_id*, across all families.

        Function-level only — deliberately not exposed as an HTTP route (#459
        explicitly asks to confirm with the team before adding a new admin
        route). Callable from a Python shell, ops script, or future internal
        tooling.
        """
        await self._store.revoke_all_for_owner(client_id)
