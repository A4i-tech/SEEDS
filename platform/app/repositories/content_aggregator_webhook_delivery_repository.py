"""Content aggregator webhook delivery-attempt log — PyMongo async data
access for the contentAggregatorWebhookDeliveries collection.

Each document represents one delivery attempt slot for a webhook event
(ticket #464). It is created in "pending" status (durable retry work, safe
to resume after a process restart) and updated in place once the attempt
executes. A failed-but-not-exhausted attempt schedules a *new* pending
document for the next attempt number, so the collection preserves one
immutable record per historical attempt. Never stores the webhook secret,
signature, or any auth credential — only metadata needed to audit/debug
delivery outcomes.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, ClassVar

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.platform.auth.dependencies import get_db


class ContentAggregatorWebhookDeliveryRepository:
    COLLECTION_NAME: ClassVar[str] = "contentAggregatorWebhookDeliveries"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def create_pending(
        self,
        *,
        webhook_id: Any,
        content_id: str,
        event: str,
        tenant_id: str,
        client_id: str,
        payload_data: dict[str, Any],
        attempt_number: int,
        next_attempt_at: str,
    ) -> dict[str, Any]:
        doc = {
            "webhookId": str(webhook_id),
            "contentId": content_id,
            "event": event,
            "tenantId": tenant_id,
            "clientId": client_id,
            "payloadData": payload_data,
            "attemptNumber": attempt_number,
            "status": "pending",
            "nextAttemptAt": next_attempt_at,
            "attemptedAt": None,
            "responseCode": None,
            "succeeded": None,
            "error": None,
            "claimedAt": None,
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def claim_due(self, now_iso: str, stale_before_iso: str) -> dict[str, Any] | None:
        """Atomically claim the earliest due pending delivery attempt.

        Also reclaims a "claimed" record whose ``claimedAt`` predates
        ``stale_before_iso`` — recovery for a consumer that claimed the
        record but crashed before recording the attempt result.
        """
        return await self._col.find_one_and_update(
            {
                "$or": [
                    {"status": "pending", "nextAttemptAt": {"$lte": now_iso}},
                    {"status": "claimed", "claimedAt": {"$lte": stale_before_iso}},
                ]
            },
            {"$set": {"status": "claimed", "claimedAt": now_iso}},
            sort=[("nextAttemptAt", 1)],
            return_document=True,
        )

    async def record_attempt_result(
        self,
        attempt_id: Any,
        *,
        status: str,
        response_code: int | None,
        succeeded: bool | None,
        error: str | None,
    ) -> None:
        await self._col.update_one(
            {"_id": attempt_id},
            {
                "$set": {
                    "status": status,
                    "attemptedAt": datetime.now(UTC).isoformat(),
                    "responseCode": response_code,
                    "succeeded": succeeded,
                    "error": error,
                    "nextAttemptAt": None,
                }
            },
        )


def get_content_aggregator_webhook_delivery_repo(
    db: AsyncDatabase = Depends(get_db),
) -> ContentAggregatorWebhookDeliveryRepository:
    return ContentAggregatorWebhookDeliveryRepository(db)
