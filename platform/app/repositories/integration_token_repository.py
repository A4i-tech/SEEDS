from __future__ import annotations

from datetime import UTC, datetime
from typing import TypedDict

from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import IntegrationToken, IntegrationTokenType
from app.platform.auth.hashing import hash_refresh_token
from app.platform.auth.refresh_tokens import (
    ConsumedToken,
    RefreshTokenExpiredError,
    RefreshTokenNotFoundError,
    RefreshTokenReusedError,
    TokenPair,
    _as_utc,
)
from app.repositories.base_repository import BaseRepository


class IntegrationClaims(TypedDict):
    tenant_ids: list[str]
    scope: str


class IntegrationTokenRepository(BaseRepository):
    """Implements the RefreshTokenStore[IntegrationClaims] protocol directly.

    The integration path stores only the SHA-256 hash of the opaque refresh
    token (never the raw value) and does NOT keep a raw-token replay cache —
    `cache_replay` is a no-op here, unlike the browser/user refresh flow.
    """

    COLLECTION = "integrationTokens"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        col = db[cls.COLLECTION]
        await col.create_index("token_id", unique=True)
        await col.create_index("client_id")
        await col.create_index("expires_at", expireAfterSeconds=0)

    @staticmethod
    def _to_consumed(doc: IntegrationToken) -> ConsumedToken[IntegrationClaims]:
        return ConsumedToken(
            owner_id=doc.client_id,
            claims={"tenant_ids": doc.tenant_ids, "scope": doc.scope},
            family_expires_at=_as_utc(doc.family_expires_at),
        )

    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        claims: IntegrationClaims,
        expires_at: datetime,
        family_expires_at: datetime,
        created_at: datetime,
    ) -> None:
        await self._col.insert_one(
            {
                "token_id": hash_refresh_token(token_id),
                "client_id": owner_id,
                "type": IntegrationTokenType.REFRESH.value,
                "tenant_ids": claims["tenant_ids"],
                "scope": claims["scope"],
                "expires_at": expires_at,
                "family_expires_at": family_expires_at,
                "revoked": False,
                "revoked_reason": None,
                "consumed_at": None,
                "created_at": created_at,
            }
        )

    async def find_by_token_id(self, token_id: str) -> IntegrationToken | None:
        doc = await self._col.find_one({"token_id": token_id})
        return IntegrationToken.from_mongo(doc) if doc is not None else None

    async def try_consume(self, token_id: str) -> ConsumedToken[IntegrationClaims]:
        hashed = hash_refresh_token(token_id)
        now = datetime.now(tz=UTC)
        doc = await self._col.find_one_and_update(
            {
                "token_id": hashed,
                "type": IntegrationTokenType.REFRESH.value,
                "revoked": False,
                "expires_at": {"$gt": now},
            },
            {"$set": {"revoked": True, "revoked_reason": "consumed", "consumed_at": now}},
        )
        if doc is not None:
            return self._to_consumed(IntegrationToken.from_mongo(doc))

        existing = await self.find_by_token_id(hashed)
        if existing is None or existing.type != IntegrationTokenType.REFRESH:
            raise RefreshTokenNotFoundError
        if not existing.revoked:
            raise RefreshTokenExpiredError
        # Already consumed or explicitly revoked. The integration path does not
        # keep a raw-token replay cache/grace window, so any presentation of a
        # revoked token is treated as reuse and revokes the whole client.
        raise RefreshTokenReusedError(existing.client_id)

    async def cache_replay(self, token_id: str, pair: TokenPair) -> None:
        # Integration refresh tokens are never cached raw. No-op by design.
        return None

    async def revoke_all_for_owner(self, owner_id: str, *, reason: str) -> None:
        await self._col.update_many(
            {"client_id": owner_id},
            {"$set": {"revoked": True, "revoked_reason": reason}},
        )

    async def logged_out_since(self, owner_id: str, since: datetime) -> bool:
        # Integration clients have no browser session/logout concept.
        return False
