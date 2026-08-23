from __future__ import annotations

from datetime import UTC, datetime
from typing import cast

from pymongo.asynchronous.database import AsyncDatabase

from app.models.refresh_token import UserClaims, UserRefreshToken
from app.platform.auth.refresh_tokens import (
    ConsumedToken,
    RefreshTokenExpiredError,
    RefreshTokenNotFoundError,
    RefreshTokenReusedError,
)
from app.repositories.base_repository import BaseRepository


class UserRefreshTokenRepository(BaseRepository):
    COLLECTION = "userRefreshTokens"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @staticmethod
    def _to_consumed(doc: dict) -> ConsumedToken[UserClaims]:
        token = UserRefreshToken.from_mongo(doc)
        return ConsumedToken(
            owner_id=token.owner_id,
            claims=cast(UserClaims, token.claims.model_dump()),
            expires_at=token.expires_at,
            revoked=token.revoked,
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
                "token_id": token_id,
                "owner_id": owner_id,
                "claims": claims,
                "expires_at": expires_at,
                "revoked": False,
                "created_at": created_at,
            }
        )

    async def try_consume(self, token_id: str) -> ConsumedToken[UserClaims]:
        doc = await self._col.find_one_and_update(
            {"token_id": token_id, "revoked": False, "expires_at": {"$gt": datetime.now(tz=UTC)}},
            {"$set": {"revoked": True}},
        )
        if doc is not None:
            return self._to_consumed(doc)

        existing = await self._col.find_one({"token_id": token_id})
        if existing is None:
            raise RefreshTokenNotFoundError
        if not existing["revoked"]:
            raise RefreshTokenExpiredError
        raise RefreshTokenReusedError(existing["owner_id"])

    async def revoke_all_for_owner(self, owner_id: str) -> None:
        await self._col.update_many({"owner_id": owner_id}, {"$set": {"revoked": True}})
