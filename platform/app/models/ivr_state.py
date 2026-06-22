"""IVR FSM state models (from IVRv2 model_classes.py)."""
from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from typing import Any

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field


class IVRCallStatus(StrEnum):
    STARTED = "started"
    RINGING = "ringing"
    ANSWERED = "answered"
    BUSY = "busy"
    CANCELLED = "cancelled"
    UNANSWERED = "unanswered"
    DISCONNECTED = "disconnected"
    REJECTED = "rejected"
    FAILED = "failed"
    HUMAN = "human"
    MACHINE = "machine"
    TIMEOUT = "timeout"
    COMPLETED = "completed"
    RECORD = "record"
    INPUT = "input"
    TRANSFER = "transfer"

    @staticmethod
    def end_statuses() -> list[IVRCallStatus]:
        return [
            IVRCallStatus.BUSY,
            IVRCallStatus.CANCELLED,
            IVRCallStatus.UNANSWERED,
            IVRCallStatus.DISCONNECTED,
            IVRCallStatus.REJECTED,
            IVRCallStatus.FAILED,
            IVRCallStatus.COMPLETED,
            IVRCallStatus.TIMEOUT,
        ]


class ConversationRTCEventType(StrEnum):
    GENERAL = "leg:status:update"
    AUDIO_DTMF = "audio:dtmf"
    AUDIO_EARMUFF_OFF = "audio:earmuff:off"
    AUDIO_EARMUFF_ON = "audio:earmuff:on"
    AUDIO_MUTE_OFF = "audio:mute:off"
    AUDIO_MUTE_ON = "audio:mute:on"
    AUDIO_PLAY_STOP = "audio:play:stop"
    AUDIO_PLAY_DONE = "audio:play:done"
    AUDIO_PLAY = "audio:play"
    AUDIO_RECORD_STOP = "audio:record:stop"
    AUDIO_RECORD_DONE = "audio:record:done"
    AUDIO_RECORD = "audio:record"
    AUDIO_ASR_DONE = "audio:asr:done"
    AUDIO_ASR_RECORD_DONE = "audio:asr:record:done"
    AUDIO_SAY_STOP = "audio:say:stop"
    AUDIO_SAY_DONE = "audio:say:done"
    AUDIO_SAY = "audio:say"
    AUDIO_SPEAKING_ON = "audio:speaking:on"
    AUDIO_SPEAKING_OFF = "audio:speaking:off"
    MEMBER_JOINED = "member:joined"
    MEMBER_LEFT = "member:left"
    RTC_STATUS = "rtc:status"
    RTC_TRANSFER = "rtc:transfer"
    RTC_HANGUP = "rtc:hangup"
    RTC_ANSWERED = "rtc:answered"


class UserAction(BaseModel):
    """A single DTMF key press captured during an IVR session."""

    model_config = ConfigDict(populate_by_name=True)

    key_pressed: str
    timestamp: datetime
    pre_state_id: str = "pre-default"
    post_state_id: str = "post-default"


class StreamPlaybackInfo(BaseModel):
    """Tracks a single audio stream segment played during an IVR call."""

    model_config = ConfigDict(populate_by_name=True)

    play_id: str
    stream_url: str
    started_at: datetime
    stopped_at: datetime | None = None
    done_at: datetime | None = None


class IVRCallStateMongoDoc(BaseModel):
    """MongoDB document representing the runtime state of an IVR call session.

    Maps to the 'ivrv2logs' collection (inherited from IvrV2Log.js).
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    phone_number: str
    fsm_id: str
    current_state_id: str
    created_at: datetime
    stopped_at: datetime | None = None
    duration: str | None = ""
    user_actions: list[UserAction] = Field(default_factory=list)
    stream_playback: list[StreamPlaybackInfo] = Field(default_factory=list)
    experience_data: dict[str, Any] = Field(default_factory=dict)
    call_status_updates: dict[str, Any] = Field(default_factory=dict)
    tenant_id: str = ""
    school_id: str | None = None

    @classmethod
    def from_mongo(cls, doc: dict) -> IVRCallStateMongoDoc:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)


class IVRfsmDoc(BaseModel):
    """MongoDB document for a compiled IVR FSM definition.

    Maps to the 'ivrfsms' (or equivalent) collection.
    """

    model_config = ConfigDict(populate_by_name=True)

    id: str | None = Field(None, alias="_id")
    created_at: int  # epoch ms
    states: list[dict[str, Any]] = Field(default_factory=list)
    transitions: list[dict[str, Any]] = Field(default_factory=list)
    init_state_id: str

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, IVRfsmDoc):
            return NotImplemented
        return (
            self.states == other.states
            and self.transitions == other.transitions
            and self.init_state_id == other.init_state_id
        )

    @classmethod
    def from_mongo(cls, doc: dict) -> IVRfsmDoc:
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)


class EventWebhookRequest(BaseModel):
    """Vonage IVR event webhook payload."""

    model_config = ConfigDict(populate_by_name=True)

    end_time: str | None = ""
    network: str | None = ""
    duration: str | None = ""
    start_time: str | None = ""
    rate: str | None = ""
    price: str | None = ""
    from_number: str = Field(..., alias="from")
    headers: dict[str, Any] = Field(default_factory=dict)
    uuid: str
    to: str
    conversation_uuid: str
    status: IVRCallStatus
    direction: str
    timestamp: str = ""


class ConversationRTCWebhookRequest(BaseModel):
    """Vonage RTC event webhook payload."""

    model_config = ConfigDict(populate_by_name=True)

    body: dict[str, Any]
    application_id: str
    timestamp: datetime
    type: ConversationRTCEventType
    conversation_id: str = "DEFAULT"
    event_id: int = Field(default=-1, alias="id")


class DTMFDetails(BaseModel):
    digits: str
    timed_out: bool

    model_config = ConfigDict(populate_by_name=True)


class DTMFInput(BaseModel):
    dtmf: DTMFDetails
    conversation_uuid: str

    model_config = ConfigDict(populate_by_name=True)


class StartIVRRequest(BaseModel):
    phone_number: str

    model_config = ConfigDict(populate_by_name=True)


class FSMRequest(BaseModel):
    fsm_id: str

    model_config = ConfigDict(populate_by_name=True)
