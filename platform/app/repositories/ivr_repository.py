"""IVR repository — Motor async data access for IVR FSM state and logs."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.ivr_state import IVRCallStateMongoDoc, IVRfsmDoc
from app.repositories.base_repository import BaseRepository


class IVRRepository(BaseRepository):
    """Async Motor repository for IVR FSM documents and call state logs.

    Collections:
      - 'ivrfsms'         : compiled FSM definitions (IVRfsmDoc)
      - 'radioFSMs'       : radio-variant FSM definitions (IVRfsmDoc)
      - 'ivrv2logs'       : per-call session state / event log (IVRCallStateMongoDoc)
      - 'ongoingIVRState' : live stream-playback state per conversation
    """

    FSM_COLLECTION = "ivrfsms"
    RADIO_COLLECTION = "radioFSMs"
    LOG_COLLECTION = "ivrv2logs"
    ONGOING_COLLECTION = "ongoingIVRState"

    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._fsm_col = db[self.FSM_COLLECTION]
        self._radio_col = db[self.RADIO_COLLECTION]
        self._log_col = db[self.LOG_COLLECTION]
        self._ongoing_col = db[self.ONGOING_COLLECTION]

    # ------------------------------------------------------------------
    # FSM definitions
    # ------------------------------------------------------------------
    async def find_fsm_by_id(self, fsm_id: str) -> IVRfsmDoc | None:
        """Retrieve a compiled FSM definition document."""
        doc = await self._fsm_col.find_one({"_id": fsm_id})
        return IVRfsmDoc.from_mongo(doc) if doc else None

    async def find_fsm_by_id_any(self, fsm_id: str) -> IVRfsmDoc | None:
        """Check ivrfsms first, then radioFSMs fallback."""
        doc = await self._fsm_col.find_one({"_id": fsm_id})
        if doc is None:
            doc = await self._radio_col.find_one({"_id": fsm_id})
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
    async def find_fsm_context(self, call_id: str) -> IVRCallStateMongoDoc | None:
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

    async def log_ivr_event(self, call_id: str, event: dict[str, Any]) -> None:
        """Append an event to the call_status_updates map in the log document."""
        await self._log_col.update_one(
            {"_id": call_id},
            {"$set": {f"call_status_updates.{event.get('status', 'unknown')}": event}},
            upsert=True,
        )

    async def find_logs_by_tenant_date_range(
        self, tenant_id: str, start: datetime, end: datetime
    ) -> list[dict[str, Any]]:
        """Return raw log documents for tenant within [start, end] — used for analytics."""
        cursor = self._log_col.find(
            {"tenant_id": tenant_id, "created_at": {"$gte": start, "$lte": end}}
        ).sort("_id", -1)
        return await cursor.to_list(length=None)

    async def update_fsm_context(self, call_id: str, updates: dict) -> IVRCallStateMongoDoc | None:
        result = await self._log_col.find_one_and_update(
            {"_id": call_id},
            {"$set": updates},
            return_document=True,
        )
        return IVRCallStateMongoDoc.from_mongo(result) if result else None

    # ------------------------------------------------------------------
    # Ongoing IVR state (stream playback tracking)
    # ------------------------------------------------------------------

    async def find_ongoing_state(self, conversation_id: str) -> dict[str, Any] | None:
        return await self._ongoing_col.find_one({"_id": conversation_id})

    async def push_stream_playback(self, conversation_id: str, item: dict[str, Any]) -> None:
        await self._ongoing_col.update_one(
            {"_id": conversation_id},
            {"$push": {"stream_playback": item}},
        )

    async def set_playback_field(
        self, conversation_id: str, play_id: str, field: str, value: Any
    ) -> None:
        await self._ongoing_col.update_one(
            {"_id": conversation_id, "stream_playback.play_id": play_id},
            {"$set": {f"stream_playback.$.{field}": value}},
        )

    # ------------------------------------------------------------------
    # Analytics — ivrv2logs by school
    # ------------------------------------------------------------------

    async def find_logs_by_school_date_range(
        self, school_id: str, start_iso: str, end_iso: str
    ) -> list[dict[str, Any]]:
        """Return raw log docs for school within ISO date range (created_at stored as string)."""
        cursor = self._log_col.find(
            {
                "school_id": school_id,
                "created_at": {"$gte": start_iso, "$lte": end_iso},
            }
        )
        return await cursor.to_list(length=None)
