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


def _as_utc(value: datetime) -> datetime:
    return value if value.tzinfo is not None else value.replace(tzinfo=UTC)


@dataclass(frozen=True)
class NewRefreshToken:
    token_id: str
    client_id: str
    tenant_ids: list[str]
    scope: str
    expires_at: datetime
    family_expires_at: datetime
    created_at: datetime


class IntegrationTokenRepository(BaseRepository):
    COLLECTION = "integrationTokens"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        col = db[cls.COLLECTION]
        await col.create_index("token_id", unique=True)
        await col.create_index("client_id")
        await col.create_index("expires_at", expireAfterSeconds=0)

    async def insert_refresh_token(self, token: NewRefreshToken) -> None:
        await self._col.insert_one(
            {
                "token_id": token.token_id,
                "client_id": token.client_id,
                "type": IntegrationTokenType.REFRESH.value,
                "tenant_ids": token.tenant_ids,
                "scope": token.scope,
                "expires_at": token.expires_at,
                "family_expires_at": token.family_expires_at,
                "revoked": False,
                "revoked_reason": None,
                "consumed_at": None,
                "created_at": token.created_at,
            }
        )

    async def find_by_token_id(self, token_id: str) -> IntegrationToken | None:
        doc = await self._col.find_one({"token_id": token_id})
        return IntegrationToken.from_mongo(doc) if doc is not None else None

    async def try_consume(self, token_id: str) -> IntegrationToken:
        now = datetime.now(tz=UTC)
        doc = await self._col.find_one_and_update(
            {
                "token_id": token_id,
                "type": IntegrationTokenType.REFRESH.value,
                "revoked": False,
                "expires_at": {"$gt": now},
            },
            {"$set": {"revoked": True, "revoked_reason": "consumed", "consumed_at": now}},
        )
        if doc is not None:
            return IntegrationToken.from_mongo(doc)

        existing = await self.find_by_token_id(token_id)
        if existing is None or existing.type != IntegrationTokenType.REFRESH:
            raise RefreshTokenNotFoundError
        if not existing.revoked:
            raise RefreshTokenExpiredError
        # Already consumed or explicitly revoked. The integration path does not
        # keep a raw-token replay cache/grace window, so any presentation of a
        # revoked token is treated as reuse and revokes the whole client.
        raise RefreshTokenReusedError(existing.client_id)

    async def revoke_all_for_client(self, client_id: str, *, reason: str | None = None) -> None:
        await self._col.update_many(
            {"client_id": client_id},
            {"$set": {"revoked": True, "revoked_reason": reason}},
        )
