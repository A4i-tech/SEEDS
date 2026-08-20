from __future__ import annotations

from typing import ClassVar

from bson import ObjectId
from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.aggregators.sync_job_models import SyncItemResult, SyncStats
from app.platform.auth.dependencies import get_db


class ContentAggregatorSyncJobItemRepository:
    COLLECTION_NAME: ClassVar[str] = "contentAggregatorSyncJobItems"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def insert(self, tenant_id: str, job_id: str, entry: SyncItemResult) -> None:
        doc = entry.to_doc()
        doc["tenant_id"] = tenant_id
        doc["job_id"] = job_id
        await self._col.insert_one(doc)

    async def list_by_job(self, tenant_id: str, job_id: str) -> list[SyncItemResult]:
        docs = await self._col.find({"tenant_id": tenant_id, "job_id": job_id}).to_list(length=None)
        return [SyncItemResult.from_doc(d) for d in docs]

    async def list_by_job_page(
        self, tenant_id: str, job_id: str, *, limit: int = 50, after: str | None = None
    ) -> tuple[list[SyncItemResult], str | None, int]:
        query: dict[str, object] = {"tenant_id": tenant_id, "job_id": job_id}
        if after:
            query["_id"] = {"$gt": ObjectId(after)}
        docs = await self._col.find(query).sort("_id", 1).limit(limit).to_list(length=limit)
        total = await self._col.count_documents({"tenant_id": tenant_id, "job_id": job_id})
        next_cursor = str(docs[-1]["_id"]) if len(docs) == limit else None
        return [SyncItemResult.from_doc(d) for d in docs], next_cursor, total

    async def get_stats(self, tenant_id: str, job_id: str) -> SyncStats:
        pipeline = [
            {"$match": {"tenant_id": tenant_id, "job_id": job_id}},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
        ]
        cursor = await self._col.aggregate(pipeline)
        counts = {d["_id"]: d["count"] async for d in cursor}
        return SyncStats(
            saved=counts.get("saved", 0), skipped=counts.get("skipped", 0),
            empty=counts.get("empty", 0), failed=counts.get("failed", 0),
        )


def get_content_aggregator_sync_job_item_repo(db: AsyncDatabase = Depends(get_db)) -> ContentAggregatorSyncJobItemRepository:
    return ContentAggregatorSyncJobItemRepository(db)
