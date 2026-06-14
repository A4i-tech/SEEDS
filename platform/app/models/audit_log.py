"""Unified audit log models (from Log.js + LogEntry.js + IvrV2Log.js)."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class AuditLog(BaseModel):
    """General application log entry (from Log.js).

    Maps to the 'logs' collection.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(None, alias="_id")
    log_id: Optional[int] = Field(None, alias="logId")  # legacy numeric id
    user: str  # user identifier
    log_text: str = Field(..., alias="logText")
    time: str
    priority: int
    tenant_id: Optional[str] = None
    created_at: Optional[datetime] = None

    @classmethod
    def from_mongo(cls, doc: dict) -> "AuditLog":
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)


class LogEntry(BaseModel):
    """HTTP request/response log entry (from LogEntry.js).

    Maps to the 'logentries' collection.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(None, alias="_id")
    path: Optional[str] = None
    method: Optional[str] = None
    request_body: Optional[Any] = Field(None, alias="requestBody")
    response_body: Optional[Any] = Field(None, alias="responseBody")
    status_code: Optional[int] = Field(None, alias="statusCode")
    timestamp: Optional[datetime] = None
    tenant_id: Optional[str] = None

    @classmethod
    def from_mongo(cls, doc: dict) -> "LogEntry":
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)


class UserActionLog(BaseModel):
    """A single user action captured within an IVR session."""

    model_config = ConfigDict(populate_by_name=True)

    action_type: Optional[str] = None
    timestamp: Optional[datetime] = None
    details: Optional[Any] = None


class StreamPlaybackLog(BaseModel):
    """Playback segment info stored in an IVR log entry."""

    model_config = ConfigDict(populate_by_name=True)

    stream_id: Optional[str] = None
    started_at: Optional[datetime] = None
    ended_at: Optional[datetime] = None
    duration: Optional[float] = None


class IvrV2Log(BaseModel):
    """IVR v2 session log document (from IvrV2Log.js).

    Maps to the 'ivrv2logs' collection.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: Optional[str] = Field(None, alias="_id")
    phone_number: str
    fsm_id: str
    current_state_id: str
    created_at: str
    stopped_at: Optional[str] = None
    duration: str = ""
    user_actions: List[UserActionLog] = Field(default_factory=list)
    stream_playback: List[StreamPlaybackLog] = Field(default_factory=list)
    experience_data: Dict[str, Any] = Field(default_factory=dict)
    call_status_updates: Dict[str, Any] = Field(default_factory=dict)
    tenant_id: str
    school_id: Optional[str] = None

    @classmethod
    def from_mongo(cls, doc: dict) -> "IvrV2Log":
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)
