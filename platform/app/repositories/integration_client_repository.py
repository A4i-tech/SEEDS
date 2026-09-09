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

    async def find_client_ids_for_tenant(self, tenant_id: str) -> list[str]:
        docs = await self._col.find({"tenant_ids": tenant_id}, {"client_id": 1}).to_list(length=None)
        return [doc["client_id"] for doc in docs]

    async def create(self, client: IntegrationClient) -> None:
        await self._col.insert_one(client.model_dump())
