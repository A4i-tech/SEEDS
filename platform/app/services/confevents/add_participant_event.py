"""Add participant event."""
from __future__ import annotations
import logging
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from app.models.action_history import ActionHistory, ActionType
from app.models.participant import CallStatus, Participant, Role
from app.services.confevents.base_event import ConferenceEvent
if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall
logger = logging.getLogger(__name__)

class AddParticipantEvent(ConferenceEvent):
    def __init__(self, phone_number: str, name: Optional[str] = None, conf_call: "ConferenceCall" = None) -> None:
        self.phone_number = phone_number
        self.name = name
        self.conf_call = conf_call

    async def execute_event(self) -> None:
        current = self.conf_call.state.participants
        if self.phone_number not in current:
            await self.conf_call.communication_api.add_participant(self.phone_number, announce_text=self.name)
            current[self.phone_number] = Participant(name=self.name or "Student", phone_number=self.phone_number, role=Role.STUDENT, call_status=CallStatus.DISCONNECTED, is_muted=True, added_after_start=True)
        elif current[self.phone_number].call_status != CallStatus.CONNECTED:
            await self.conf_call.communication_api.add_participant(self.phone_number, announce_text=self.name)
            current[self.phone_number].call_status = CallStatus.CONNECTING
            if self.name:
                current[self.phone_number].name = self.name
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.TEACHER_ADD_STUDENT, metadata={"phone_number": self.phone_number}, owner=self.conf_call.state.teacher_phone_number or ""))
        await self.conf_call.update_state()
