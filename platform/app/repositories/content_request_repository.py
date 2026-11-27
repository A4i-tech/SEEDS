from __future__ import annotations

from datetime import UTC, datetime

from bson import ObjectId
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.repositories.base_repository import BaseRepository
from app.repositories.content_repository import ContentRepository

_REQUEST_FIELDS = {"_id", "tenant_id", "client_id", "key", "payload_hash", "job_id", "created_at"}


class ContentRequestRepository(BaseRepository):
    COLLECTION = "content_requests"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]
        self.staged = ContentRepository(db, self.COLLECTION)

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        await db[cls.COLLECTION].create_index([("tenant_id", 1), ("client_id", 1), ("key", 1)], unique=True)

    async def claim(self, tenant_id: ObjectId, client_id: str, key: str, payload_hash: str, doc: dict) -> bool:
        try:
            await self._col.insert_one(
                doc
                | {
                    "tenant_id": tenant_id,
                    "client_id": client_id,
                    "key": key,
                    "payload_hash": payload_hash,
                    "job_id": "",
                    "created_at": datetime.now(UTC),
                }
            )
        except DuplicateKeyError:
            return False
        return True

    async def find(self, tenant_id: ObjectId, client_id: str, key: str) -> dict:
        return await self._col.find_one({"tenant_id": tenant_id, "client_id": client_id, "key": key})

    async def set_job(self, tenant_id: ObjectId, client_id: str, key: str, job_id: str) -> None:
        await self._col.update_one(
            {"tenant_id": tenant_id, "client_id": client_id, "key": key}, {"$set": {"job_id": job_id}}
        )

    async def release(self, content_id: str) -> None:
        row = await self._col.find_one({"_id": ObjectId(content_id)})
        await self._col.update_one(
            {"_id": row["_id"]}, {"$unset": {k: "" for k in row if k not in _REQUEST_FIELDS}}
        )
