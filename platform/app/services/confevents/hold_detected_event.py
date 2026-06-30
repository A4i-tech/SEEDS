"""Hold detected event."""
from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import TYPE_CHECKING

from app.models.action_history import ActionHistory, ActionType
from app.models.participant import CallStatus
from app.services.confevents.base_event import ConferenceEvent

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall
logger = logging.getLogger(__name__)

class HoldDetectedEvent(ConferenceEvent):
    def __init__(self, phone_number: str, conf_call: ConferenceCall) -> None:
        self.phone_number = phone_number
        self.conf_call = conf_call

    async def execute_event(self) -> None:
        participant = self.conf_call.state.participants.get(self.phone_number)
        if not participant:
            return
        if participant.call_status == CallStatus.ON_HOLD:
            return
        participant.call_status = CallStatus.ON_HOLD
        self.conf_call.state.hold_detected = True
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now(UTC).isoformat(), action_type=ActionType.SYSTEM_HOLD_DETECTED, metadata={"phone_number": self.phone_number, "status": CallStatus.ON_HOLD.value}, owner="system"))
        await self.conf_call.update_state()
