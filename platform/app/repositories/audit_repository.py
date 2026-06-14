"""Audit repository — Motor async data access for logs, log entries, and IVR logs."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.audit_log import AuditLog, IvrV2Log, LogEntry


class AuditRepository:
    """Async Motor repository for unified audit log documents.

    Collections:
      - 'logs'       : AuditLog (from Log.js)
      - 'logentries' : LogEntry (from LogEntry.js)
      - 'ivrv2logs'  : IvrV2Log (from IvrV2Log.js)
    """

    AUDIT_COLLECTION = "logs"
    ENTRY_COLLECTION = "logentries"
    IVR_COLLECTION = "ivrv2logs"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._audit_col = db[self.AUDIT_COLLECTION]
        self._entry_col = db[self.ENTRY_COLLECTION]
        self._ivr_col = db[self.IVR_COLLECTION]

    @staticmethod
    def _to_id(id_str: str) -> ObjectId | str:
        try:
            return ObjectId(id_str)
        except Exception:
            return id_str

    # ------------------------------------------------------------------
    # AuditLog
    # ------------------------------------------------------------------
    async def create_log(self, log: AuditLog) -> AuditLog:
        doc = log.model_dump(by_alias=True, exclude_none=True)
        doc.pop("_id", None)
        doc.setdefault("created_at", datetime.now(timezone.utc))
        result = await self._audit_col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return AuditLog.from_mongo(doc)

    async def find_recent_by_tenant(self, tenant_id: str, limit: int = 100) -> List[AuditLog]:
        cursor = self._audit_col.find({"tenant_id": tenant_id}).sort("_id", -1).limit(limit)
        docs = await cursor.to_list(length=None)
        return [AuditLog.from_mongo(d) for d in docs]

    async def find_logs_by_user(self, user_id: str) -> List[AuditLog]:
        cursor = self._audit_col.find({"user": user_id}).sort("_id", -1)
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

    async def find_recent_entries(self, limit: int = 50) -> List[LogEntry]:
        cursor = self._entry_col.find({}).sort("timestamp", -1).limit(limit)
        docs = await cursor.to_list(length=None)
        return [LogEntry.from_mongo(d) for d in docs]

    # ------------------------------------------------------------------
    # IvrV2Log
    # ------------------------------------------------------------------
    async def create_ivr_log(self, log: IvrV2Log) -> IvrV2Log:
        doc = log.model_dump(by_alias=True, exclude_none=True)
        doc.pop("_id", None)
        result = await self._ivr_col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return IvrV2Log.from_mongo(doc)

    async def find_ivr_log_by_phone(self, phone_number: str) -> Optional[IvrV2Log]:
        doc = await self._ivr_col.find_one({"phone_number": phone_number})
        return IvrV2Log.from_mongo(doc) if doc else None

    async def find_ivr_logs_by_tenant(self, tenant_id: str, limit: int = 100) -> List[IvrV2Log]:
        cursor = self._ivr_col.find({"tenant_id": tenant_id}).sort("_id", -1).limit(limit)
        docs = await cursor.to_list(length=None)
        return [IvrV2Log.from_mongo(d) for d in docs]
