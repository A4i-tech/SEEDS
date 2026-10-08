from __future__ import annotations

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import IntegrationClient
from app.platform.auth.dependencies import get_db
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

    async def reserve_webhook_slot(self, client_id: str, max_webhooks: int) -> bool:
        result = await self._col.find_one_and_update(
            {
                "client_id": client_id,
                "$expr": {"$lt": [{"$ifNull": ["$webhookCount", 0]}, max_webhooks]},
            },
            {"$inc": {"webhookCount": 1}},
        )
        return result is not None

    async def release_webhook_slot(self, client_id: str) -> None:
        await self._col.update_one(
            {"client_id": client_id, "webhookCount": {"$gt": 0}},
            {"$inc": {"webhookCount": -1}},
        )


def get_integration_client_repo(db: AsyncDatabase = Depends(get_db)) -> IntegrationClientRepository:
    return IntegrationClientRepository(db)
