"""Unmute participant event."""
from __future__ import annotations
import logging
from datetime import datetime
from typing import TYPE_CHECKING
from app.models.action_history import ActionHistory, ActionType
from app.models.system_audio_messages import SystemAudioMessages
from app.services.confevents.base_event import ConferenceEvent
if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall
logger = logging.getLogger(__name__)

class UnmuteParticipantEvent(ConferenceEvent):
    def __init__(self, phone_number: str, conf_call: "ConferenceCall", stream_system_message: bool = True) -> None:
        self.phone_number = phone_number
        self.conf_call = conf_call
        self.stream_system_message = stream_system_message

    async def execute_event(self) -> None:
        if self.phone_number not in self.conf_call.state.participants:
            return
        participant = self.conf_call.state.participants[self.phone_number]
        await self.conf_call.communication_api.unmute_participant(self.phone_number)
        participant.is_muted = False
        participant.is_raised = False
        participant.raised_at = -1
        teacher = self.conf_call.state.get_teacher()
        if self.stream_system_message and teacher and self.phone_number != teacher.phone_number:
            await self.conf_call.stream_system_message(SystemAudioMessages.STUDENT_IS_UNMUTED)
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.TEACHER_MUTE_UNMUTE_STUDENT, metadata={"phone_number": self.phone_number, "is_muted": False}, owner=self.conf_call.state.teacher_phone_number or ""))
        await self.conf_call.update_state()
