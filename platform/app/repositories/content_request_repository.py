from __future__ import annotations

from datetime import UTC, datetime

from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.repositories.base_repository import BaseRepository


class ContentRequestRepository(BaseRepository):
    COLLECTION = "content_requests"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        await db[cls.COLLECTION].create_index([("tenant_id", 1), ("client_id", 1), ("key", 1)], unique=True)

    async def claim(self, tenant_id: ObjectId, client_id: str, key: str, payload_hash: str) -> bool:
        try:
            await self._col.insert_one(
                {
                    "tenant_id": tenant_id,
                    "client_id": client_id,
                    "key": key,
                    "payload_hash": payload_hash,
                    "content_id": "",
                    "job_id": "",
                    "created_at": datetime.now(UTC),
                }
            )
        except DuplicateKeyError:
            return False
        return True

    async def find(self, tenant_id: ObjectId, client_id: str, key: str) -> dict:
        return await self._col.find_one({"tenant_id": tenant_id, "client_id": client_id, "key": key})

    async def set_result(
        self, tenant_id: ObjectId, client_id: str, key: str, content_id: str, job_id: str
    ) -> None:
        await self._col.update_one(
            {"tenant_id": tenant_id, "client_id": client_id, "key": key},
            {"$set": {"content_id": content_id, "job_id": job_id}},
        )
