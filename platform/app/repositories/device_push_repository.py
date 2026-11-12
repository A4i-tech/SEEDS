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

    async def insert(self, record: DevicePushRecord) -> None:
        await self._col.insert_one(record.model_dump())

    async def find_by_source_id(self, source_id: str, tenant_id: str | None = None) -> DevicePushRecord | None:
        query = {"source_id": source_id}
        if tenant_id is not None:
            query["tenant_id"] = tenant_id
        doc = await self._col.find_one(query)
        return DevicePushRecord.model_validate(doc) if doc else None

    async def update_status(
        self, source_id: str, status: PushStatus, synced_at: datetime | None
    ) -> DevicePushRecord | None:
        fields: dict[str, str | datetime] = {"status": status}
        if synced_at is not None:
            fields["synced_at"] = synced_at
        await self._col.update_one({"source_id": source_id}, {"$set": fields})
        return await self.find_by_source_id(source_id)
