"""Remove participant event."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from app.models.action_history import ActionHistory, ActionType
from app.models.participant import CallStatus, Role
from app.services.confevents.base_event import ConferenceEvent

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

class RemoveParticipantEvent(ConferenceEvent):
    def __init__(self, phone_number: str, conf_call: ConferenceCall) -> None:
        self.phone_number = phone_number
        self.conf_call = conf_call

    async def execute_event(self) -> None:
        if self.phone_number not in self.conf_call.state.participants:
            return
        participant = self.conf_call.state.participants[self.phone_number]
        remaining = [n for n, p in self.conf_call.state.participants.items() if n != self.phone_number and p.call_status == CallStatus.CONNECTED]
        if remaining:
            leave_text = "Teacher has left" if participant.role == Role.TEACHER else f"{participant.name} has left"
            await self.conf_call.communication_api.play_announcement_to_conference(leave_text, remaining)
        await self.conf_call.communication_api.remove_participant(self.phone_number)
        del self.conf_call.state.participants[self.phone_number]
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.TEACHER_REMOVE_STUDENT, metadata={"phone_number": self.phone_number}, owner=self.conf_call.state.teacher_phone_number or ""))
        await self.conf_call.update_state()
