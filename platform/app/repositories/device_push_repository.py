from __future__ import annotations

from datetime import datetime

from pymongo.asynchronous.database import AsyncDatabase

from app.models.device_push import DevicePushRecord, PushStatus
from app.platform.settings import get_settings


class DevicePushRepository:
    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[get_settings().vembi_pushes_collection_name]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        await db[get_settings().vembi_pushes_collection_name].create_index("source_id", unique=True)

    async def insert_if_absent(self, record: DevicePushRecord) -> DevicePushRecord:
        doc = await self._col.find_one_and_update(
            {"source_id": record.source_id},
            {"$setOnInsert": record.model_dump(exclude={"source_id"})},
            upsert=True,
            return_document=True,
        )
        return DevicePushRecord.model_validate(doc)

    async def find_by_source_id(self, source_id: str) -> DevicePushRecord | None:
        doc = await self._col.find_one({"source_id": source_id})
        return DevicePushRecord.model_validate(doc) if doc else None

    async def find_by_source_id_and_tenant(self, source_id: str, tenant_id: str) -> DevicePushRecord | None:
        doc = await self._col.find_one({"source_id": source_id, "tenant_id": tenant_id})
        return DevicePushRecord.model_validate(doc) if doc else None

    async def update_status(
        self, source_id: str, status: PushStatus, synced_at: datetime
    ) -> DevicePushRecord:
        await self._col.update_one(
            {"source_id": source_id}, {"$set": {"status": status, "synced_at": synced_at}}
        )
        return await self.find_by_source_id(source_id)
