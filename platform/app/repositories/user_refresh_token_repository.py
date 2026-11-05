from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

from pymongo.asynchronous.database import AsyncDatabase

from app.models.refresh_token import UserClaims, UserRefreshToken
from app.platform.auth.hashing import hash_refresh_token
from app.platform.auth.refresh_tokens import (
    ConsumedToken,
    RefreshTokenExpiredError,
    RefreshTokenNotFoundError,
    RefreshTokenReusedError,
    RefreshTokenRevokedError,
    _as_utc,
)
from app.repositories.base_repository import BaseRepository


class UserRefreshTokenRepository(BaseRepository):
    COLLECTION = "userRefreshTokens"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        col = db[cls.COLLECTION]
        await col.create_index("token_id", unique=True)
        await col.create_index("owner_id")
        await col.create_index("expires_at", expireAfterSeconds=0)

    @staticmethod
    def _to_consumed(doc: dict) -> ConsumedToken[UserClaims]:
        token = UserRefreshToken.from_mongo(doc)
        return ConsumedToken(
            owner_id=token.owner_id,
            claims=cast(UserClaims, token.claims.model_dump()),
            family_expires_at=_as_utc(token.family_expires_at),
        )

    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        claims: UserClaims,
        expires_at: datetime,
        family_expires_at: datetime,
        created_at: datetime,
    ) -> None:
        await self._col.insert_one(
            {
                "token_id": hash_refresh_token(token_id),
                "owner_id": owner_id,
                "claims": claims,
                "expires_at": expires_at,
                "family_expires_at": family_expires_at,
                "revoked": False,
                "revoked_reason": None,
                "consumed_at": None,
                "created_at": created_at,
            }
        )

    async def try_consume(self, token_id: str) -> ConsumedToken[UserClaims]:
        hashed = hash_refresh_token(token_id)
        now = datetime.now(tz=UTC)
        doc = await self._col.find_one_and_update(
            {"token_id": hashed, "revoked": False, "expires_at": {"$gt": now}},
            {"$set": {"revoked": True, "revoked_reason": "consumed", "consumed_at": now}},
        )
        if doc is not None:
            return self._to_consumed(doc)

        existing = await self._col.find_one({"token_id": hashed})
        if existing is None:
            raise RefreshTokenNotFoundError
        if not existing["revoked"]:
            raise RefreshTokenExpiredError
        if existing.get("revoked_reason") == "logout":
            raise RefreshTokenRevokedError(existing["owner_id"])
        raise RefreshTokenReusedError(existing["owner_id"])

    async def revoke_all_for_owner(
        self, owner_id: str, *, reason: str, include_token_id: str | None = None
    ) -> None:
        query: dict = {"owner_id": owner_id, "revoked": False}
        if include_token_id is not None:
            query = {"$or": [query, {"token_id": hash_refresh_token(include_token_id)}]}
        await self._col.update_many(query, {"$set": {"revoked": True, "revoked_reason": reason}})
