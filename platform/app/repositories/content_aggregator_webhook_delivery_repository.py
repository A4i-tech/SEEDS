"""Content aggregator webhook delivery-attempt log — PyMongo async data
access for the contentAggregatorWebhookDeliveries collection.

Records one document per HTTP delivery attempt (ticket #464). Never stores
the webhook secret, signature, or any auth credential — only metadata needed
to audit/debug delivery outcomes.
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

    async def log_attempt(
        self,
        webhook_id: Any,
        content_id: str,
        event: str,
        attempt_number: int,
        response_code: int | None,
        succeeded: bool,
        error: str | None,
    ) -> None:
        await self._col.insert_one(
            {
                "webhookId": str(webhook_id),
                "contentId": content_id,
                "event": event,
                "attemptedAt": datetime.now(UTC).isoformat(),
                "attemptNumber": attempt_number,
                "responseCode": response_code,
                "succeeded": succeeded,
                "error": error,
            }
        )


def get_content_aggregator_webhook_delivery_repo(
    db: AsyncDatabase = Depends(get_db),
) -> ContentAggregatorWebhookDeliveryRepository:
    return ContentAggregatorWebhookDeliveryRepository(db)
