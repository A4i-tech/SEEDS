from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, ClassVar

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.platform.auth.dependencies import get_db


class ContentAggregatorWebhookRepository:
    COLLECTION_NAME: ClassVar[str] = "contentAggregatorWebhooks"
    SECRET_HASH_FIELD: ClassVar[str] = "secret_hash"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def count_for_client(self, client_id: str) -> int:
        return await self._col.count_documents({"client_id": client_id})

    async def create(self, client_id: str, url: str, secret_hash: str, events: list[str]) -> dict[str, Any]:
        now = datetime.now(UTC).isoformat()
        doc = {
            "client_id": client_id,
            "url": url,
            "secret_hash": secret_hash,
            "events": events,
            "status": "active",
            "created_at": now,
            "updated_at": now,
        }
        result = await self._col.insert_one(doc)
        doc["_id"] = result.inserted_id
        return doc

    async def list_for_client(self, client_id: str) -> list[dict[str, Any]]:
        return await self._col.find({"client_id": client_id}).sort("created_at", 1).to_list(length=None)

    async def update_for_client(self, client_id: str, webhook_id: str, fields: dict[str, Any]) -> dict[str, Any] | None:
        try:
            oid = ObjectId(webhook_id)
        except InvalidId:
            return None
        fields["updated_at"] = datetime.now(UTC).isoformat()
        return await self._col.find_one_and_update(
            {"_id": oid, "client_id": client_id},
            {"$set": fields},
            return_document=ReturnDocument.AFTER,
        )

    async def delete_for_client(self, client_id: str, webhook_id: str) -> bool:
        try:
            oid = ObjectId(webhook_id)
        except InvalidId:
            return False
        result = await self._col.delete_one({"_id": oid, "client_id": client_id})
        return result.deleted_count > 0


def get_content_aggregator_webhook_repo(db: AsyncDatabase = Depends(get_db)) -> ContentAggregatorWebhookRepository:
    return ContentAggregatorWebhookRepository(db)
