from __future__ import annotations

from datetime import datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.models.refresh_token import UserRefreshToken
from app.platform.auth.refresh_tokens import ConsumedToken
from app.repositories.base_repository import BaseRepository


class UserRefreshTokenRepository(BaseRepository):
    COLLECTION = "userRefreshTokens"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @staticmethod
    def _to_consumed(doc: dict | None) -> ConsumedToken | None:
        if doc is None:
            return None
        token = UserRefreshToken.from_mongo(doc)
        return ConsumedToken(
            owner_id=token.owner_id,
            family_id=token.family_id,
            claims=token.claims,
            expires_at=token.expires_at,
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
        await self._col.insert_one(
            {
                "token_id": token_id,
                "owner_id": owner_id,
                "family_id": family_id,
                "claims": claims,
                "expires_at": expires_at,
                "revoked": False,
                "created_at": created_at,
            }
        )

    async def find_by_token_id(self, token_id: str) -> ConsumedToken | None:
        doc = await self._col.find_one({"token_id": token_id})
        return self._to_consumed(doc)

    async def try_consume(self, token_id: str) -> ConsumedToken | None:
        """Atomically claim an unrevoked token for rotation."""
        doc = await self._col.find_one_and_update(
            {"token_id": token_id, "revoked": False},
            {"$set": {"revoked": True}},
        )
        return self._to_consumed(doc)

    async def revoke_family(self, owner_id: str, family_id: str) -> None:
        await self._col.update_many(
            {"owner_id": owner_id, "family_id": family_id},
            {"$set": {"revoked": True}},
        )

    async def revoke_all_for_owner(self, owner_id: str) -> None:
        await self._col.update_many({"owner_id": owner_id}, {"$set": {"revoked": True}})
