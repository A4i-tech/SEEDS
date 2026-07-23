"""Integration token repository — Motor async data access for 'integrationTokens'.

Persists refresh tokens (access tokens are stateless JWTs, never stored).
"""
from __future__ import annotations

from datetime import datetime

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.content_aggregator import IntegrationToken, IntegrationTokenType
from app.repositories.base_repository import BaseRepository


class IntegrationTokenRepository(BaseRepository):
    COLLECTION = "integrationTokens"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def insert_refresh_token(
        self,
        token_id: str,
        client_id: str,
        family_id: str,
        tenant_id: str,
        scopes: list[str],
        expires_at: datetime,
        created_at: datetime,
    ) -> None:
        await self._col.insert_one(
            {
                "token_id": token_id,
                "client_id": client_id,
                "type": IntegrationTokenType.REFRESH.value,
                "family_id": family_id,
                "tenant_id": tenant_id,
                "scopes": scopes,
                "expires_at": expires_at,
                "revoked": False,
                "created_at": created_at,
            }
        )

    async def find_by_token_id(self, token_id: str) -> IntegrationToken | None:
        doc = await self._col.find_one({"token_id": token_id})
        return IntegrationToken.from_mongo(doc) if doc else None

    async def try_consume(self, token_id: str) -> IntegrationToken | None:
        """Atomically claim an unrevoked token for rotation.

        Concurrent callers racing the same token_id can only have one winner:
        the filter requires revoked=False, so a second caller's update matches
        nothing once the first has flipped the flag. Returns the pre-update
        document on success, None if the token doesn't exist or was already
        revoked (by a prior rotation, a race loser, or reuse) — callers must
        treat None the same as "revoked" for reuse-detection purposes.
        """
        doc = await self._col.find_one_and_update(
            {"token_id": token_id, "revoked": False},
            {"$set": {"revoked": True}},
        )
        return IntegrationToken.from_mongo(doc) if doc else None

    async def revoke_family(self, client_id: str, family_id: str) -> None:
        """Revoke every token in a family (reuse detection / admin revoke)."""
        await self._col.update_many(
            {"client_id": client_id, "family_id": family_id},
            {"$set": {"revoked": True}},
        )

    async def revoke_all_for_client(self, client_id: str) -> None:
        """Revoke every token for a client, across all families (admin revoke)."""
        await self._col.update_many({"client_id": client_id}, {"$set": {"revoked": True}})
