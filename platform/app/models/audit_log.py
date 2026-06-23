"""Unified audit log models (from Log.js + LogEntry.js + IvrV2Log.js)."""
from __future__ import annotations

from datetime import datetime
from typing import Any

from bson import ObjectId
from pydantic import Field

from app.models.base import BaseDocument


class AuditLog(BaseDocument):
    """General application log entry (from Log.js).

    Maps to the 'logs' collection.
    """

    id: str | None = Field(None, alias="_id")
    log_id: int | None = None              # alias: logId
    user: str
    log_text: str                          # alias: logText
    time: str
    priority: int
    tenant_id: str | None = None           # alias: tenantId
    created_at: datetime | None = None     # alias: createdAt

    @classmethod
    def from_mongo(cls, doc: dict) -> AuditLog:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)


class LogEntry(BaseDocument):
    """HTTP request/response log entry (from LogEntry.js).

    Maps to the 'logentries' collection.
    """

    id: str | None = Field(None, alias="_id")
    path: str | None = None
    method: str | None = None
    request_body: Any | None = None        # alias: requestBody
    response_body: Any | None = None       # alias: responseBody
    status_code: int | None = None         # alias: statusCode
    timestamp: datetime | None = None
    tenant_id: str | None = None           # alias: tenantId

    @classmethod
    def from_mongo(cls, doc: dict) -> LogEntry:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)


class UserActionLog(BaseDocument):
    """A single user action captured within an IVR session."""

    action_type: str | None = None         # alias: actionType
    timestamp: datetime | None = None
    details: Any | None = None


class StreamPlaybackLog(BaseDocument):
    """Playback segment info stored in an IVR log entry."""

    stream_id: str | None = None           # alias: streamId
    started_at: datetime | None = None     # alias: startedAt
    ended_at: datetime | None = None       # alias: endedAt
    duration: float | None = None


class IvrV2Log(BaseDocument):
    """IVR v2 session log document (from IvrV2Log.js).

    Maps to the 'ivrv2logs' collection.
    """

    id: str | None = Field(None, alias="_id")
    phone_number: str                      # alias: phoneNumber
    fsm_id: str                            # alias: fsmId
    current_state_id: str                  # alias: currentStateId
    created_at: str                        # alias: createdAt
    stopped_at: str | None = None          # alias: stoppedAt
    duration: str = ""
    user_actions: list[UserActionLog] = Field(default_factory=list)   # alias: userActions
    stream_playback: list[StreamPlaybackLog] = Field(default_factory=list)  # alias: streamPlayback
    experience_data: dict[str, Any] = Field(default_factory=dict)     # alias: experienceData
    call_status_updates: dict[str, Any] = Field(default_factory=dict) # alias: callStatusUpdates
    tenant_id: str                         # alias: tenantId
    school_id: str | None = None           # alias: schoolId

    @classmethod
    def from_mongo(cls, doc: dict) -> IvrV2Log:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)
