from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, ClassVar

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.models.content_aggregator import Webhook
from app.models.requests.webhook_registration_requests import (
    WebhookEventType,
    WebhookStatus,
)
from app.repositories.base_repository import BaseRepository

SECRET_ENCRYPTED_FIELD = "secret_encrypted"
DEFAULT_WEBHOOK_LIMIT = 5


class ContentAggregatorWebhookRepository(BaseRepository):
    COLLECTION_NAME: ClassVar[str] = "contentAggregatorWebhooks"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        await db[cls.COLLECTION_NAME].create_index("client_id")
        await db[cls.COLLECTION_NAME].create_index([("client_id", 1), ("slot", 1)], unique=True)

    async def create(
        self,
        client_id: str,
        url: str,
        secret_encrypted: str,
        events: list[WebhookEventType],
        limit: int = DEFAULT_WEBHOOK_LIMIT,
    ) -> Webhook | None:
        now = datetime.now(UTC)
        doc: dict[str, Any] = {
            "client_id": client_id,
            "url": url,
            SECRET_ENCRYPTED_FIELD: secret_encrypted,
            "events": [e.value for e in events],
            "status": WebhookStatus.ACTIVE.value,
            "created_at": now,
            "updated_at": now,
        }
        for slot in range(limit):
            doc["slot"] = slot
            try:
                result = await self._col.insert_one(doc)
            except DuplicateKeyError:
                continue
            doc["_id"] = result.inserted_id
            return Webhook.from_mongo(doc)
        return None

    async def list_for_client(self, client_id: str) -> list[Webhook]:
        docs = await self._col.find({"client_id": client_id}).sort("created_at", 1).to_list(length=None)
        return [Webhook.from_mongo(d) for d in docs]

    async def get_for_client(self, client_id: str, webhook_id: str) -> Webhook | None:
        doc = await self._col.find_one({"_id": self._to_id(webhook_id), "client_id": client_id})
        return Webhook.from_mongo(doc) if doc is not None else None

    async def find_active_for_clients_and_event(
        self, client_ids: list[str], event: WebhookEventType
    ) -> list[Webhook]:
        docs = await self._col.find(
            {
                "client_id": {"$in": client_ids},
                "status": WebhookStatus.ACTIVE.value,
                "events": event.value,
            }
        ).to_list(length=None)
        return [Webhook.from_mongo(d) for d in docs]

    async def disable(self, webhook_id: str) -> None:
        await self._col.update_one(
            {"_id": self._to_id(webhook_id)},
            {"$set": {"status": WebhookStatus.DISABLED.value, "updated_at": datetime.now(UTC)}},
        )

    async def update_for_client(
        self,
        client_id: str,
        webhook_id: str,
        *,
        updates: dict[str, Any] | None = None,
        secret_encrypted: str | None = None,
    ) -> Webhook | None:
        fields: dict[str, Any] = {"updated_at": datetime.now(UTC), **(updates or {})}
        if secret_encrypted is not None:
            fields[SECRET_ENCRYPTED_FIELD] = secret_encrypted

        doc = await self._col.find_one_and_update(
            {"_id": self._to_id(webhook_id), "client_id": client_id},
            {"$set": fields},
            return_document=ReturnDocument.AFTER,
        )
        return Webhook.from_mongo(doc) if doc is not None else None

    async def delete_for_client(self, client_id: str, webhook_id: str) -> bool:
        result = await self._col.delete_one({"_id": self._to_id(webhook_id), "client_id": client_id})
        return result.deleted_count > 0
