from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, ClassVar

from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.models.content_aggregator import DeliveryAttempt, DeliveryStatus
from app.models.requests.webhook_registration_requests import WebhookEventType
from app.repositories.base_repository import BaseRepository


class ContentAggregatorWebhookDeliveryRepository(BaseRepository):
    COLLECTION_NAME: ClassVar[str] = "contentAggregatorWebhookDeliveries"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        await db[cls.COLLECTION_NAME].create_index([("status", 1), ("next_attempt_at", 1)])
        await db[cls.COLLECTION_NAME].create_index([("status", 1), ("claimed_at", 1)])

    async def create_pending(
        self,
        *,
        webhook_id: str,
        content_id: str,
        event: WebhookEventType,
        tenant_id: str,
        client_id: str,
        payload_data: dict[str, Any],
        attempt_number: int,
        next_attempt_at: datetime,
    ) -> DeliveryAttempt:
        doc: dict[str, Any] = {
            "webhook_id": self._to_id(webhook_id),
            "content_id": content_id,
            "event": WebhookEventType(event).value,
            "tenant_id": tenant_id,
            "client_id": client_id,
            "payload_data": payload_data,
            "attempt_number": attempt_number,
            "status": DeliveryStatus.PENDING.value,
            "next_attempt_at": next_attempt_at,
            "attempted_at": None,
            "response_code": None,
            "succeeded": None,
            "error": None,
            "claimed_at": None,
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return DeliveryAttempt.from_mongo(doc)

    async def claim_due(self, now: datetime, stale_before: datetime) -> DeliveryAttempt | None:
        doc = await self._col.find_one_and_update(
            {
                "$or": [
                    {"status": DeliveryStatus.PENDING.value, "next_attempt_at": {"$lte": now}},
                    {"status": DeliveryStatus.CLAIMED.value, "claimed_at": {"$lte": stale_before}},
                ]
            },
            {"$set": {"status": DeliveryStatus.CLAIMED.value, "claimed_at": now}},
            sort=[("next_attempt_at", 1)],
            return_document=ReturnDocument.AFTER,
        )
        return DeliveryAttempt.from_mongo(doc) if doc is not None else None

    async def record_attempt_result(
        self,
        attempt_id: str,
        *,
        status: DeliveryStatus,
        response_code: int | None,
        succeeded: bool | None,
        error: str | None,
    ) -> None:
        await self._col.update_one(
            {"_id": self._to_id(attempt_id)},
            {
                "$set": {
                    "status": DeliveryStatus(status).value,
                    "attempted_at": datetime.now(UTC),
                    "response_code": response_code,
                    "succeeded": succeeded,
                    "error": error,
                    "next_attempt_at": None,
                }
            },
        )

    async def release_claim(self, attempt_id: str, *, next_attempt_at: datetime, error: str) -> None:
        await self._col.update_one(
            {"_id": self._to_id(attempt_id)},
            {
                "$set": {
                    "status": DeliveryStatus.PENDING.value,
                    "next_attempt_at": next_attempt_at,
                    "claimed_at": None,
                    "error": error,
                }
            },
        )
