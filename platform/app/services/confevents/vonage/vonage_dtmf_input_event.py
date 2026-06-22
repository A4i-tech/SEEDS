"""Vonage RTC DTMF input event wrapper."""
from __future__ import annotations

from enum import StrEnum
from typing import TYPE_CHECKING, Any

from pydantic import BaseModel, Field, validator

from app.services.confevents.dtmf_input_event import DTMFInputEvent

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

class ChannelNumber(BaseModel):
    type: str
    number: str

class Channel(BaseModel):
    id: str
    type: str
    to: ChannelNumber
    from_: ChannelNumber = Field(..., alias="from")
    class Config:
        populate_by_name = True

class Body(BaseModel):
    digit: str
    duration: int
    channel: Channel
    dtmf_seq: int

class VonageRTCEventType(StrEnum):
    DTMF = "audio:dtmf"
    UNKNOWN = "ringing"

class VonageDTMFInputEvent(BaseModel):
    body: Body
    type: VonageRTCEventType

    @validator("type", pre=True)
    def validate_type(cls, v: Any) -> VonageRTCEventType:
        if v not in VonageRTCEventType.__members__.values():
            return VonageRTCEventType.UNKNOWN
        return VonageRTCEventType(v)

    def get_conf_dtmf_input_event(self, conf_call: ConferenceCall) -> DTMFInputEvent:
        return DTMFInputEvent(phone_number=self.body.channel.to.number, digit=self.body.digit, conf_call=conf_call)

    def get_user_phone_number(self) -> str:
        return self.body.channel.to.number
