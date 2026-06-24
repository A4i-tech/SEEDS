"""Call domain models (from Call.js + CallLog.js)."""
from __future__ import annotations

from typing import Any

from bson import ObjectId
from pydantic import Field

from app.models.base import BaseDocument


class Call(BaseDocument):
    """Sequence tracking document from the 'calls' collection (legacy Call.js)."""

    id: str | None = Field(None, alias="_id")
    call_id: int = Field(..., alias="id")   # DB field is 'id', not 'callId'
    index: int

    @classmethod
    def from_mongo(cls, doc: dict) -> Call:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)


class CallLog(BaseDocument):
    """IVR call log entry stored in the 'calllogs' collection (CallLog.js)."""

    id: str | None = Field(None, alias="_id")
    type: str
    time: str
    fsm_context_id: str                    # alias: fsmContextId
    data: dict[str, Any] | None = None
    is_completed: bool                     # alias: isCompleted

    @classmethod
    def from_mongo(cls, doc: dict) -> CallLog:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)
