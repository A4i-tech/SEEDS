"""Unified audit log models (from Log.js + LogEntry.js + IvrV2Log.js)."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class AuditLog(BaseModel):
    """General application log entry (from Log.js).

    Maps to the 'logs' collection.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    log_id: int | None = Field(None, alias="logId")
    user: str
    log_text: str = Field(alias="logText")
    time: str
    priority: int
    tenant_id: str | None = Field(None, alias="tenantId")
    created_at: datetime | None = Field(None, alias="createdAt")

    @classmethod
    def from_mongo(cls, doc: dict) -> AuditLog:
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

    id: str | None = Field(None, alias="_id")
    path: str | None = None
    method: str | None = None
    request_body: Any | None = Field(None, alias="requestBody")
    response_body: Any | None = Field(None, alias="responseBody")
    status_code: int | None = Field(None, alias="statusCode")
    timestamp: datetime | None = None
    tenant_id: str | None = Field(None, alias="tenantId")

    @classmethod
    def from_mongo(cls, doc: dict) -> LogEntry:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)


class UserActionLog(BaseModel):
    """A single user action captured within an IVR session."""

    model_config = ConfigDict(populate_by_name=True)

    action_type: str | None = None
    timestamp: datetime | None = None
    details: Any | None = None


class StreamPlaybackLog(BaseModel):
    """Playback segment info stored in an IVR log entry."""

    model_config = ConfigDict(populate_by_name=True)

    stream_id: str | None = None
    started_at: datetime | None = None
    ended_at: datetime | None = None
    duration: float | None = None


class IvrV2Log(BaseModel):
    """IVR v2 session log document (from IvrV2Log.js).

    Maps to the 'ivrv2logs' collection.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    phone_number: str
    fsm_id: str
    current_state_id: str
    created_at: str
    stopped_at: str | None = None
    duration: str = ""
    user_actions: list[UserActionLog] = Field(default_factory=list)
    stream_playback: list[StreamPlaybackLog] = Field(default_factory=list)
    experience_data: dict[str, Any] = Field(default_factory=dict)
    call_status_updates: dict[str, Any] = Field(default_factory=dict)
    tenant_id: str
    school_id: str | None = None

    @classmethod
    def from_mongo(cls, doc: dict) -> IvrV2Log:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)
