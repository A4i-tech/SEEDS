"""Vonage call status change event wrapper."""
from __future__ import annotations
from enum import Enum
from typing import Any, TYPE_CHECKING
from pydantic import BaseModel, Field, validator
from app.models.participant import CallStatus
from app.services.confevents.call_status_change_event import CallStatusChangeEvent
if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

class VonageCallStatus(str, Enum):
    STARTED = "started"
    RINGING = "ringing"
    ANSWERED = "answered"
    COMPLETED = "completed"
    NOTCONNECTED = "notconnected"

class VonageCallStatusChangeEvent(BaseModel):
    status: VonageCallStatus
    phone_number: str = Field(..., alias="to")

    @validator("status", pre=True)
    def validate_status(cls, v: Any) -> VonageCallStatus:
        if v not in VonageCallStatus.__members__.values():
            return VonageCallStatus.NOTCONNECTED
        return VonageCallStatus(v)

    class Config:
        populate_by_name = True

    def get_conf_call_status_change_event(self, conf_call: "ConferenceCall") -> CallStatusChangeEvent:
        if self.status in (VonageCallStatus.STARTED, VonageCallStatus.RINGING):
            status = CallStatus.CONNECTING
        elif self.status == VonageCallStatus.ANSWERED:
            status = CallStatus.CONNECTED
        else:
            status = CallStatus.DISCONNECTED
        return CallStatusChangeEvent(phone_number=self.phone_number, status=status, conf_call=conf_call)
