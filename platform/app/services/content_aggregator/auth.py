from __future__ import annotations

import logging
import secrets
import uuid
from datetime import UTC, datetime
from typing import TypedDict

import bcrypt
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import (
    IntegrationClient,
    IntegrationClientStatus,
    IntegrationToken,
)
from app.platform.auth import refresh_tokens
from app.platform.auth.hashing import verify_password
from app.platform.auth.refresh_tokens import (
    ConsumedToken,
    TokenPair,
)
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.repositories.integration_client_repository import IntegrationClientRepository
from app.repositories.integration_token_repository import (
    IntegrationTokenRepository,
    NewRefreshToken,
)
from app.services.content_aggregator import _jwt

logger = logging.getLogger(__name__)


class IntegrationClaims(TypedDict):
    tenant_ids: list[str]
    scope: str


class IntegrationTokenPair(TokenPair):
    scope: str


class _IntegrationTokenStore:
    def __init__(self, repo: IntegrationTokenRepository) -> None:
        self._repo = repo

    @staticmethod
    def _to_consumed(doc: IntegrationToken) -> ConsumedToken[IntegrationClaims]:
        return ConsumedToken(
            owner_id=doc.client_id,
            claims={"tenant_ids": doc.tenant_ids, "scope": doc.scope},
            expires_at=doc.expires_at,
            revoked=doc.revoked,
        )

    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        claims: IntegrationClaims,
        expires_at: datetime,
        created_at: datetime,
    ) -> None:
        await self._repo.insert_refresh_token(
            NewRefreshToken(
                token_id=token_id,
                client_id=owner_id,
                tenant_ids=claims["tenant_ids"],
                scope=claims["scope"],
                expires_at=expires_at,
                created_at=created_at,
            )
        )

    async def try_consume(self, token_id: str) -> ConsumedToken[IntegrationClaims]:
        doc = await self._repo.try_consume(token_id)
        return self._to_consumed(doc)

    async def revoke_all_for_owner(self, owner_id: str) -> None:
        await self._repo.revoke_all_for_client(owner_id)


class IntegrationClaims(TypedDict):
    tenant_ids: list[str]
    scope: str


class IntegrationTokenPair(TokenPair):
    scope: str


class _IntegrationTokenStore:
    def __init__(self, repo: IntegrationTokenRepository) -> None:
        self._repo = repo

    @staticmethod
    def _to_consumed(doc: IntegrationToken) -> ConsumedToken[IntegrationClaims]:
        return ConsumedToken(
            owner_id=doc.client_id,
            claims={"tenant_ids": doc.tenant_ids, "scope": doc.scope},
            expires_at=doc.expires_at,
            revoked=doc.revoked,
        )

    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        claims: IntegrationClaims,
        expires_at: datetime,
        created_at: datetime,
    ) -> None:
        await self._repo.insert_refresh_token(
            NewRefreshToken(
                token_id=token_id,
                client_id=owner_id,
                tenant_ids=claims["tenant_ids"],
                scope=claims["scope"],
                expires_at=expires_at,
                created_at=created_at,
            )
        )

    async def try_consume(self, token_id: str) -> ConsumedToken[IntegrationClaims]:
        doc = await self._repo.try_consume(token_id)
        return self._to_consumed(doc)

    async def revoke_all_for_owner(self, owner_id: str) -> None:
        await self._repo.revoke_all_for_client(owner_id)


class ContentAggregatorAuth:
    def __init__(
        self,
        db: AsyncDatabase,
        settings: Settings,
    ) -> None:
        self._clients = IntegrationClientRepository(db)
        self._store = _IntegrationTokenStore(IntegrationTokenRepository(db))
        self._settings = settings

    async def issue_token(
        self,
        client_id: str,
        client_secret: str,
        scopes: list[str],
    ) -> IntegrationTokenPair:
        client = await self._clients.find_by_client_id(client_id)
        if client is None or not verify_password(client_secret, client.client_secret_hash):
            logger.warning("content_aggregator auth: invalid credentials for client_id=%s", client_id)
            raise UnauthorizedError("Invalid client credentials")

        if client.status != IntegrationClientStatus.ACTIVE:
            raise AppError("TENANT_NOT_ALLOWED", "Client is not active", 403)

        granted_tenant_ids = list(client.tenant_ids)

        if not set(scopes).issubset(client.allowed_scopes):
            raise AppError("SCOPE_INSUFFICIENT", "Requested scopes exceed allowed scopes", 403)
        requested_scopes = scopes

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

    async def verify_token(self, token: str) -> _jwt.AccessTokenClaims:
        return _jwt.decode_access_token(token, secret_key=self._settings.secret_key)

    async def refresh_token(self, refresh_token: str) -> IntegrationTokenPair:
        granted_scope = ""

        async def verify_owner_active(owner_id: str, claims: IntegrationClaims) -> IntegrationClaims:
            client = await self._clients.find_by_client_id(owner_id)
            if client is None or client.status != IntegrationClientStatus.ACTIVE:
                raise AppError("TENANT_NOT_ALLOWED", "Client is not active", 403)
            return claims

        async def build_access_token(owner_id: str, claims: IntegrationClaims) -> tuple[str, int]:
            nonlocal granted_scope
            granted_scope = claims["scope"]
            client = await self._clients.find_by_client_id(owner_id)
            client_name = client.name if client is not None else owner_id
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
