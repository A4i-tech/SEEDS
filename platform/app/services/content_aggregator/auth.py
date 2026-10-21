from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime

import bcrypt
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import IntegrationClient, IntegrationClientStatus
from app.platform.auth import refresh_tokens
from app.platform.auth.hashing import verify_password
from app.platform.auth.refresh_tokens import TokenPair
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.repositories.integration_client_repository import IntegrationClientRepository
from app.repositories.integration_token_repository import (
    IntegrationClaims,
    IntegrationTokenRepository,
)
from app.services.content_aggregator import _jwt

logger = logging.getLogger(__name__)


class IntegrationTokenPair(TokenPair):
    scope: str


class ContentAggregatorAuth:
    def __init__(
        self,
        db: AsyncDatabase,
        settings: Settings,
    ) -> None:
        self._clients = IntegrationClientRepository(db)
        self._store = IntegrationTokenRepository(db)
        self._settings = settings

    async def issue_token(
        self,
        client_id: str,
        client_secret: str,
        scopes: list[str],
    ) -> IntegrationTokenPair:
        client = await self._clients.find_by_client_id(client_id)
        if client is None or not verify_password(client_secret, client.client_secret_hash):
            logger.warning(
                "content_aggregator auth: invalid credentials for client_id=%s", client_id
            )
            raise UnauthorizedError("Invalid client credentials")

        if client.status != IntegrationClientStatus.ACTIVE:
            raise AppError("TENANT_NOT_ALLOWED", "Client is not active", 403)

        granted_tenant_ids = list(client.tenant_ids)

        if not set(scopes).issubset(client.allowed_scopes):
            raise AppError("SCOPE_INSUFFICIENT", "Requested scopes exceed allowed scopes", 403)
        requested_scopes = scopes
        if not requested_scopes:
            raise AppError("SCOPE_INSUFFICIENT", "No scopes granted to client", 403)

        access_token, expires_in = _jwt.encode_access_token(
            client_id=client.client_id,
            tenant_ids=granted_tenant_ids,
            scopes=requested_scopes,
            client_name=client.name,
            secret_key=self._settings.secret_key,
            expires_in=self._settings.content_aggregator_access_token_expires_in,
        )

        granted_scope = " ".join(requested_scopes)
        pair = await refresh_tokens.issue_pair(
            self._store,
            owner_id=client.client_id,
            claims={"tenant_ids": granted_tenant_ids, "scope": granted_scope},
            access_token=access_token,
            access_expires_in=expires_in,
            refresh_ttl=self._settings.content_aggregator_refresh_token_expires_in,
        )
        return {**pair, "scope": granted_scope}

    async def register_client(
        self,
        name: str,
        tenant_ids: list[str],
        scopes: list[str],
    ) -> tuple[str, str]:
        client_id = str(uuid.uuid4())
        client_secret = secrets.token_urlsafe(32)
        secret_hash = bcrypt.hashpw(
            client_secret.encode("utf-8"),
            bcrypt.gensalt(rounds=self._settings.password_salt_rounds),
        ).decode("utf-8")
        await self._clients.create(
            IntegrationClient(
                client_id=client_id,
                client_secret_hash=secret_hash,
                name=name,
                tenant_ids=tenant_ids,
                allowed_scopes=scopes,
                created_at=datetime.now(tz=UTC),
            )
        )
        return client_id, client_secret

    async def refresh_token(self, refresh_token: str) -> IntegrationTokenPair:
        granted_scope = ""
        client_name = ""

        async def verify_owner_active(
            owner_id: str, claims: IntegrationClaims
        ) -> IntegrationClaims:
            nonlocal client_name
            client = await self._clients.find_by_client_id(owner_id)
            if client is None:
                raise UnauthorizedError("Invalid refresh token")
            if client.status != IntegrationClientStatus.ACTIVE:
                raise AppError("TENANT_NOT_ALLOWED", "Client is not active", 403)
            client_name = client.name
            return claims

        async def build_access_token(owner_id: str, claims: IntegrationClaims) -> tuple[str, int]:
            nonlocal granted_scope
            granted_scope = claims["scope"]
            return _jwt.encode_access_token(
                client_id=owner_id,
                tenant_ids=claims["tenant_ids"],
                scopes=claims["scope"].split(),
                client_name=client_name,
                secret_key=self._settings.secret_key,
                expires_in=self._settings.content_aggregator_access_token_expires_in,
            )

        pair = await refresh_tokens.rotate(
            self._store,
            refresh_token,
            verify_owner_active=verify_owner_active,
            build_access_token=build_access_token,
            refresh_ttl=self._settings.content_aggregator_refresh_token_expires_in,
            reuse_counter_name="content_aggregator_auth.reuse_detected",
        )
        return {**pair, "scope": granted_scope}
