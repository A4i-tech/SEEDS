from __future__ import annotations

from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import IntegrationClient
from app.repositories.base_repository import BaseRepository


class IntegrationClientRepository(BaseRepository):
    COLLECTION = "integrationClients"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        await db[cls.COLLECTION].create_index("client_id", unique=True)

    async def find_by_client_id(self, client_id: str) -> IntegrationClient | None:
        doc = await self._col.find_one({"client_id": client_id})
        return IntegrationClient.from_mongo(doc) if doc is not None else None

    async def create(self, client: IntegrationClient) -> None:
        await self._col.insert_one(client.model_dump())
