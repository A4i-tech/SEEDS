"""Integration client repository — Motor async data access for 'integrationClients'.

Read-only for #458: client provisioning/CRUD is out of scope (see #457).
"""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.content_aggregator import IntegrationClient
from app.repositories.base_repository import BaseRepository


class IntegrationClientRepository(BaseRepository):
    COLLECTION = "integrationClients"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[self.COLLECTION]

    async def find_by_client_id(self, client_id: str) -> IntegrationClient | None:
        doc = await self._col.find_one({"client_id": client_id})
        return IntegrationClient.from_mongo(doc) if doc else None
