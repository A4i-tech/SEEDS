from enum import Enum
from typing import Any, Optional

from pydantic import BaseModel, Field, validator

from app.services.confevents.call_status_change_event import CallStatusChangeEvent
from app.models.participant import CallStatus
from app.services.conference_call import ConferenceCall


class VonageCallStatus(str, Enum):
    STARTED = "started"
    RINGING = "ringing"
    ANSWERED = "answered"
    COMPLETED = "completed"
    NOTCONNECTED = "notconnected"


class VonageCallStatusChangeEvent(BaseModel):
    status: VonageCallStatus
    phone_number: str = Field(..., alias="to")
    # Optional fields for additional context
    direction: Optional[str] = None
    from_: Optional[str] = Field(None, alias="from")

    @validator("status", pre=True)
    def validate_status_field(cls, value: Any) -> VonageCallStatus:
        if value not in VonageCallStatus.__members__.values():
            return VonageCallStatus.NOTCONNECTED
        return VonageCallStatus(value)

    class Config:
        populate_by_name = True  # Corrected from 'allow_population_by_field_name'

    def get_conf_call_status_change_event(
        self, conf_call: ConferenceCall
    ) -> CallStatusChangeEvent:
        status: CallStatus = None
        if (
            self.status == VonageCallStatus.STARTED
            or self.status == VonageCallStatus.RINGING
        ):
            status = CallStatus.CONNECTING
        elif self.status == VonageCallStatus.ANSWERED:
            status = CallStatus.CONNECTED
        else:
            status = CallStatus.DISCONNECTED

        return CallStatusChangeEvent(
            phone_number=self.phone_number, status=status, conf_call=conf_call
        )

    def is_potential_hold_event(self, conf_call: ConferenceCall) -> bool:
        """
        Detects if this status change event might indicate a participant putting the call on hold.

        HOLD DETECTION LOGIC:
        When a participant receives an external call while in a Vonage conference:
        1. Their status changes from ANSWERED/CONNECTED to RINGING or STARTED
        2. This indicates they're receiving a new incoming call
        3. When they answer the new call, they typically put the conference on hold
        4. The carrier injects hold music into the RTP stream
        5. Without earmuffing, this hold music broadcasts to all conference participants

        Returns True if:
        - Participant exists in conference state
        - Participant's current status is CONNECTED (actively in call)
        - New webhook status is RINGING or STARTED (receiving external call)
        """
        from app.conf_logger import logger_instance

        if self.phone_number not in conf_call.state.participants:
            return False

        participant = conf_call.state.participants[self.phone_number]

        # Check if participant was CONNECTED and is now RINGING/STARTED
        is_hold = participant.call_status == CallStatus.CONNECTED and self.status in [
            VonageCallStatus.RINGING,
            VonageCallStatus.STARTED,
        ]

        if is_hold:
            logger_instance.info(
                f"[HOLD DETECTION] Potential hold detected for {self.phone_number}: "
                f"{participant.call_status} → {self.status}"
            )

        return is_hold
