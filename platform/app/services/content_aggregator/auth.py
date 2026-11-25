from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime

from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import (
    IntegrationClaims,
    IntegrationClient,
    IntegrationClientStatus,
)
from app.models.responses.login import AggregatorTokenResponse
from app.platform.auth import refresh_tokens
from app.platform.auth.hashing import hash_password, verify_password
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.repositories.integration_client_repository import IntegrationClientRepository
from app.repositories.integration_token_repository import IntegrationTokenRepository
from app.services.content_aggregator import _jwt

logger = logging.getLogger(__name__)


class ContentAggregatorAuth:
    def __init__(
        self,
        db: AsyncDatabase,
        settings: Settings,
    ) -> None:
        self._clients = IntegrationClientRepository(db)
        self._store = IntegrationTokenRepository(db)
        self._settings = settings

    def _encode_access_token(self, client_id: str, claims: IntegrationClaims) -> tuple[str, int]:
        return _jwt.encode_access_token(
            client_id=client_id,
            tenant_ids=claims["tenant_ids"],
            scopes=claims["scopes"],
            client_name=claims["client_name"],
            secret_key=self._settings.secret_key,
            expires_in=self._settings.content_aggregator_access_token_expires_in,
        )

    async def issue_token(
        self,
        client_id: str,
        client_secret: str,
    ) -> AggregatorTokenResponse:
        client = await self._clients.find_by_client_id(client_id)
        if not await verify_password(client_secret, client.client_secret_hash):
            logger.warning(
                "content_aggregator auth: invalid credentials for client_id=%s", client_id
            )
            raise UnauthorizedError("Invalid client credentials")

        if client.status != IntegrationClientStatus.ACTIVE:
            raise AppError("TENANT_NOT_ALLOWED", "Client is not active", 403)

        claims: IntegrationClaims = {
            "tenant_ids": client.tenant_ids,
            "scopes": client.allowed_scopes,
            "client_name": client.name,
        }
        access_token, expires_in = self._encode_access_token(client.client_id, claims)
        pair = await refresh_tokens.issue_pair(
            self._store,
            owner_id=client.client_id,
            claims=claims,
            access_token=access_token,
            access_expires_in=expires_in,
            refresh_ttl=self._settings.content_aggregator_refresh_token_expires_in,
        )
        return AggregatorTokenResponse(**pair)

    async def register_client(
        self,
        name: str,
        tenant_ids: list[str],
        scopes: list[str],
        created_by: str,
    ) -> tuple[str, str]:
        client_id = str(uuid.uuid4())
        client_secret = secrets.token_urlsafe(32)
        now = datetime.now(tz=UTC)
        await self._clients.create(
            IntegrationClient(
                client_id=client_id,
                client_secret_hash=await hash_password(client_secret),
                name=name,
                tenant_ids=tenant_ids,
                allowed_scopes=scopes,
                created_by=created_by,
                created_at=now,
                updated_at=now,
            )
        )
        return client_id, client_secret

    async def refresh_token(self, refresh_token: str) -> AggregatorTokenResponse:
        async def verify_owner_active(
            owner_id: str, claims: IntegrationClaims
        ) -> IntegrationClaims:
            client = await self._clients.find_by_client_id(owner_id)
            if client.status != IntegrationClientStatus.ACTIVE:
                raise AppError("TENANT_NOT_ALLOWED", "Client is not active", 403)
            return {**claims, "client_name": client.name}

        pair, claims = await refresh_tokens.rotate(
            self._store,
            refresh_token,
            verify_owner_active=verify_owner_active,
            build_access_token=self._encode_access_token,
            refresh_ttl=self._settings.content_aggregator_refresh_token_expires_in,
        )
        return AggregatorTokenResponse(**pair)
