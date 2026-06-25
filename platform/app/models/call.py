"""Call domain models (from Call.js + CallLog.js)."""
from __future__ import annotations

from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class Call(BaseModel):
    """Sequence tracking document from the 'calls' collection (legacy Call.js).

    Used to track monotonically increasing call IDs and round-robin index.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    call_id: int = Field(..., alias="id")   # unique numeric call identifier
    index: int                              # round-robin / sequence index

    @classmethod
    def from_mongo(cls, doc: dict) -> Call:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)


class CallLog(BaseModel):
    """IVR call log entry stored in the 'calllogs' collection (CallLog.js)."""

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    type: str
    time: str
    fsm_context_id: str
    data: dict[str, Any] | None = None
    is_completed: bool

    @classmethod
    def from_mongo(cls, doc: dict) -> CallLog:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)
