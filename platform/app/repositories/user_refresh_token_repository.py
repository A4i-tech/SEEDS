from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import cast

from pymongo.asynchronous.database import AsyncDatabase

from app.models.refresh_token import UserClaims, UserRefreshToken
from app.platform.auth.refresh_tokens import (
    ConsumedToken,
    RefreshTokenExpiredError,
    RefreshTokenNotFoundError,
    RefreshTokenReusedError,
    RefreshTokenRevokedError,
)
from app.repositories.base_repository import BaseRepository


def _hash_refresh_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


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
        )

    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        claims: UserClaims,
        expires_at: datetime,
        created_at: datetime,
    ) -> None:
        await self._col.insert_one(
            {
                "token_id": _hash_refresh_token(token_id),
                "owner_id": owner_id,
                "claims": claims,
                "expires_at": expires_at,
                "revoked": False,
                "revoked_reason": None,
                "created_at": created_at,
            }
        )

    async def try_consume(self, token_id: str) -> ConsumedToken[UserClaims]:
        token_id = _hash_refresh_token(token_id)
        doc = await self._col.find_one_and_update(
            {"token_id": token_id, "revoked": False, "expires_at": {"$gt": datetime.now(tz=UTC)}},
            {"$set": {"revoked": True, "revoked_reason": "consumed"}},
        )
        if doc is not None:
            return self._to_consumed(doc)

        existing = await self._col.find_one({"token_id": token_id})
        if existing is None:
            raise RefreshTokenNotFoundError
        if not existing["revoked"]:
            raise RefreshTokenExpiredError
        if existing.get("revoked_reason") == "logout":
            raise RefreshTokenRevokedError
        raise RefreshTokenReusedError(existing["owner_id"])

    async def revoke_all_for_owner(self, owner_id: str, *, reason: str) -> None:
        await self._col.update_many(
            {"owner_id": owner_id, "revoked": False},
            {"$set": {"revoked": True, "revoked_reason": reason}},
        )
