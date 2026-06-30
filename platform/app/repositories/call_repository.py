"""Call repository — Motor async data access for call and call log collections."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.call import Call, CallLog
from app.repositories.base_repository import BaseRepository


class CallsLogRepository:
    """Async Motor repository for the 'callsLog' IVR missed-call log collection.

    Distinct from CallRepository.calllogs — this is the IVRv2-origin collection
    tracking missed-call webhook receipts and their processing status.
    """

    COLLECTION = "callsLog"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:  # type: ignore[type-arg]
        self._col = db[self.COLLECTION]

    async def create_pending(self, phone_number: str) -> str:
        """Insert a new pending call log entry. Returns the string ID for the SB payload."""
        result = await self._col.insert_one({
            "phone_number": phone_number,
            "created_at": datetime.now(UTC),
            "status": "pending",
        })
        return str(result.inserted_id)

    async def mark_called(self, call_log_id: str) -> None:
        """Update status to 'called' by ObjectId string."""
        await self._col.update_one(
            {"_id": ObjectId(call_log_id)},
            {"$set": {"status": "called", "called_at": datetime.now(UTC)}},
        )

    async def find_by_id(self, call_log_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": ObjectId(call_log_id)})


class CallRepository(BaseRepository):
    """Async Motor repository for call sequence, call log, and FSM context documents."""

    CALL_COLLECTION = "calls"
    LOG_COLLECTION = "calllogs"
    FSM_COLLECTION = "fsmcontexts"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._call_col = db[self.CALL_COLLECTION]
        self._log_col = db[self.LOG_COLLECTION]
        self._fsm_col = db[self.FSM_COLLECTION]

    # ------------------------------------------------------------------
    # Call sequence documents
    # ------------------------------------------------------------------
    async def find_call_by_id(self, id: str) -> Call | None:
        doc = await self._call_col.find_one({"_id": self._to_id(id)})
        return Call.from_mongo(doc) if doc else None

    async def create_call(self, call: Call) -> Call:
        doc = call.model_dump(by_alias=True, exclude_none=True)
        doc.pop("_id", None)
        result = await self._call_col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return Call.from_mongo(doc)

    # ------------------------------------------------------------------
    # Call log documents
    # ------------------------------------------------------------------
    async def find_log_by_fsm_context(self, fsm_context_id: str) -> CallLog | None:
        doc = await self._log_col.find_one({"fsmContextId": fsm_context_id})
        return CallLog.from_mongo(doc) if doc else None

    async def find_logs_by_tenant(self, tenant_id: str) -> list[CallLog]:
        cursor = self._log_col.find({"tenant_id": tenant_id}).sort("_id", -1)
        docs = await cursor.to_list(length=None)
        return [CallLog.from_mongo(d) for d in docs]

    async def find_logs_by_teacher(self, teacher_id: str) -> list[CallLog]:
        cursor = self._log_col.find({"teacher_id": teacher_id}).sort("_id", -1)
        docs = await cursor.to_list(length=None)
        return [CallLog.from_mongo(d) for d in docs]

    async def create_log(self, log: CallLog) -> CallLog:
        doc = log.model_dump(by_alias=True, exclude_none=True)
        doc.pop("_id", None)
        result = await self._log_col.insert_one(doc)
        doc["_id"] = str(result.inserted_id)
        return CallLog.from_mongo(doc)

    async def update_log(self, id: str, updates: dict) -> CallLog | None:
        result = await self._log_col.find_one_and_update(
            {"_id": self._to_id(id)},
            {"$set": updates},
            return_document=True,
        )
        return CallLog.from_mongo(result) if result else None

    async def insert_raw_log(self, data: dict) -> dict:
        result = await self._log_col.insert_one(data)
        data["_id"] = str(result.inserted_id)
        return data

    async def find_raw_log_by_id(self, id: str) -> dict[str, Any] | None:
        doc = await self._log_col.find_one({"_id": self._to_id(id)})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc

    # ------------------------------------------------------------------
    # FSM context documents
    # ------------------------------------------------------------------

    async def insert_fsm_context(self, data: dict) -> dict:
        result = await self._fsm_col.insert_one(data)
        data["_id"] = str(result.inserted_id)
        return data

    async def find_fsm_context_by_id(self, id: str) -> dict[str, Any] | None:
        doc = await self._fsm_col.find_one({"_id": self._to_id(id)})
        if doc:
            doc["_id"] = str(doc["_id"])
        return doc
