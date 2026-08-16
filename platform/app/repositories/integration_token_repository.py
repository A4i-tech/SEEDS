from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import IntegrationToken, IntegrationTokenType
from app.platform.auth.refresh_tokens import (
    RefreshTokenExpiredError,
    RefreshTokenNotFoundError,
    RefreshTokenReusedError,
)
from app.repositories.base_repository import BaseRepository


@dataclass(frozen=True)
class NewRefreshToken:
    """Fields required to persist a new integration refresh token."""

    token_id: str
    client_id: str
    tenant_ids: list[str]
    scope: str
    expires_at: datetime
    created_at: datetime


class IntegrationTokenRepository(BaseRepository):
    COLLECTION = "integrationTokens"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def insert_refresh_token(self, token: NewRefreshToken) -> None:
        await self._col.insert_one(
            {
                "token_id": token.token_id,
                "client_id": token.client_id,
                "type": IntegrationTokenType.REFRESH.value,
                "tenant_ids": token.tenant_ids,
                "scope": token.scope,
                "expires_at": token.expires_at,
                "revoked": False,
                "created_at": token.created_at,
            }
        )

    async def find_by_token_id(self, token_id: str) -> IntegrationToken | None:
        doc = await self._col.find_one({"token_id": token_id})
        return IntegrationToken.from_mongo(doc) if doc is not None else None

    async def try_consume(self, token_id: str) -> IntegrationToken:
        """Atomically claim an unrevoked, unexpired REFRESH token.

        Raises:
            RefreshTokenNotFoundError: no matching REFRESH token.
            RefreshTokenExpiredError: token exists, never consumed, past expiry.
            RefreshTokenReusedError: token exists but already consumed/revoked.
        """
        doc = await self._col.find_one_and_update(
            {
                "token_id": token_id,
                "type": IntegrationTokenType.REFRESH.value,
                "revoked": False,
                "expires_at": {"$gt": datetime.now(tz=UTC)},
            },
            {"$set": {"revoked": True}},
        )
        if doc is not None:
            return IntegrationToken.from_mongo(doc)

        existing = await self.find_by_token_id(token_id)
        if existing is None or existing.type != IntegrationTokenType.REFRESH:
            raise RefreshTokenNotFoundError
        if not existing.revoked:
            raise RefreshTokenExpiredError
        raise RefreshTokenReusedError(existing.client_id)

    async def revoke_all_for_client(self, client_id: str) -> None:
        """Revoke every token for a client (reuse detection / admin revoke)."""
        await self._col.update_many({"client_id": client_id}, {"$set": {"revoked": True}})
