"""IVR repository — Motor async data access for IVR FSM state and logs."""
from __future__ import annotations

from typing import Any, Dict, Optional

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.ivr_state import IVRCallStateMongoDoc, IVRfsmDoc


class IVRRepository:
    """Async Motor repository for IVR FSM documents and call state logs.

    Collections:
      - 'ivrfsms'    : compiled FSM definitions (IVRfsmDoc)
      - 'ivrv2logs'  : per-call session state / event log (IVRCallStateMongoDoc)
    """

    FSM_COLLECTION = "ivrfsms"
    LOG_COLLECTION = "ivrv2logs"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._fsm_col = db[self.FSM_COLLECTION]
        self._log_col = db[self.LOG_COLLECTION]

    @staticmethod
    def _to_id(id_str: str) -> ObjectId | str:
        try:
            return ObjectId(id_str)
        except Exception:
            return id_str

    # ------------------------------------------------------------------
    # FSM definitions
    # ------------------------------------------------------------------
    async def find_fsm_by_id(self, fsm_id: str) -> Optional[IVRfsmDoc]:
        """Retrieve a compiled FSM definition document."""
        doc = await self._fsm_col.find_one({"_id": fsm_id})
        return IVRfsmDoc.from_mongo(doc) if doc else None

    async def save_fsm(self, fsm: IVRfsmDoc) -> IVRfsmDoc:
        """Upsert an FSM definition document."""
        doc = fsm.model_dump(by_alias=True)
        fsm_id = doc.get("_id")
        if fsm_id:
            await self._fsm_col.replace_one({"_id": fsm_id}, doc, upsert=True)
        else:
            result = await self._fsm_col.insert_one(doc)
            doc["_id"] = str(result.inserted_id)
        return IVRfsmDoc.from_mongo(doc)

    # ------------------------------------------------------------------
    # Call state / FSM context
    # ------------------------------------------------------------------
    async def find_fsm_context(self, call_id: str) -> Optional[IVRCallStateMongoDoc]:
        """Retrieve the IVR session state document for a call UUID."""
        doc = await self._log_col.find_one({"_id": call_id})
        return IVRCallStateMongoDoc.from_mongo(doc) if doc else None

    async def save_fsm_context(self, ctx: IVRCallStateMongoDoc) -> IVRCallStateMongoDoc:
        """Upsert an IVR call state document."""
        doc = ctx.model_dump(by_alias=True)
        call_id = doc.get("_id")
        if call_id:
            await self._log_col.replace_one({"_id": call_id}, doc, upsert=True)
        else:
            result = await self._log_col.insert_one(doc)
            doc["_id"] = str(result.inserted_id)
        return IVRCallStateMongoDoc.from_mongo(doc)

    async def log_ivr_event(self, call_id: str, event: Dict[str, Any]) -> None:
        """Append an event to the call_status_updates map in the log document."""
        await self._log_col.update_one(
            {"_id": call_id},
            {"$set": {f"call_status_updates.{event.get('status', 'unknown')}": event}},
            upsert=True,
        )

    async def update_fsm_context(self, call_id: str, updates: dict) -> Optional[IVRCallStateMongoDoc]:
        result = await self._log_col.find_one_and_update(
            {"_id": call_id},
            {"$set": updates},
            return_document=True,
        )
        return IVRCallStateMongoDoc.from_mongo(result) if result else None
