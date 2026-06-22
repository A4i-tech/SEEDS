"""Audit repository — Motor async data access for application logs and log entries.

IVR session logs (ivrv2logs collection) are owned by IVRRepository.
"""
from __future__ import annotations

from datetime import UTC, datetime

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.audit_log import AuditLog, LogEntry
from app.repositories.base_repository import BaseRepository


class AuditRepository(BaseRepository):
    """Async Motor repository for application audit log documents.

    Collections:
      - 'logs'       : AuditLog (from Log.js)
      - 'logentries' : LogEntry (from LogEntry.js)
    """

    AUDIT_COLLECTION = "logs"
    ENTRY_COLLECTION = "logentries"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._audit_col = db[self.AUDIT_COLLECTION]
        self._entry_col = db[self.ENTRY_COLLECTION]

    # ------------------------------------------------------------------
    # AuditLog
    # ------------------------------------------------------------------
    async def create_log(self, log: AuditLog) -> AuditLog:
        doc = log.model_dump(by_alias=True, exclude_none=True)
        doc.pop("_id", None)
        doc.setdefault("created_at", datetime.now(UTC))
        result = await self._audit_col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return AuditLog.from_mongo(doc)

    async def find_recent_by_tenant(self, tenant_id: str, limit: int = 100) -> list[AuditLog]:
        cursor = self._audit_col.find({"tenant_id": tenant_id}).sort("_id", -1).limit(limit)
        docs = await cursor.to_list(length=None)
        return [AuditLog.from_mongo(d) for d in docs]

    async def find_logs_by_user_and_tenant(self, user_id: str, tenant_id: str) -> list[AuditLog]:
        cursor = self._audit_col.find({"user": user_id, "tenant_id": tenant_id}).sort("_id", -1)
        docs = await cursor.to_list(length=None)
        return [AuditLog.from_mongo(d) for d in docs]

    # ------------------------------------------------------------------
    # LogEntry (HTTP request/response)
    # ------------------------------------------------------------------
    async def create_log_entry(self, entry: LogEntry) -> LogEntry:
        doc = entry.model_dump(by_alias=True, exclude_none=True)
        doc.pop("_id", None)
        result = await self._entry_col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return LogEntry.from_mongo(doc)

    async def find_recent_entries(self, limit: int = 50) -> list[LogEntry]:
        cursor = self._entry_col.find({}).sort("timestamp", -1).limit(limit)
        docs = await cursor.to_list(length=None)
        return [LogEntry.from_mongo(d) for d in docs]
