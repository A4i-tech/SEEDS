"""Integration token repository — Motor async data access for 'integrationTokens'.

#458 only persists refresh tokens (access tokens are stateless JWTs, never
stored). Revocation/rotation beyond insert+lookup is out of scope here.
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
        expires_at: datetime,
        created_at: datetime,
    ) -> None:
        await self._col.insert_one(
            {
                "token_id": token_id,
                "client_id": client_id,
                "type": IntegrationTokenType.REFRESH.value,
                "expires_at": expires_at,
                "revoked": False,
                "created_at": created_at,
            }
        )

    async def find_by_token_id(self, token_id: str) -> IntegrationToken | None:
        doc = await self._col.find_one({"token_id": token_id})
        return IntegrationToken.from_mongo(doc) if doc else None
