"""Call status change event — handles participant connect/disconnect lifecycle."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from app.models.participant import CallStatus, Participant
from app.models.system_audio_messages import SystemAudioMessages
from app.services.confevents.base_event import ConferenceEvent

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

logger = logging.getLogger(__name__)


class CallStatusChangeEvent(ConferenceEvent):
    def __init__(self, phone_number: str, status: CallStatus, conf_call: "ConferenceCall") -> None:
        self.phone_number = phone_number
        self.status = status
        self.conf_call = conf_call

    async def execute_event(self) -> None:
        if self.phone_number not in self.conf_call.state.participants:
            return
        participant: Participant = self.conf_call.state.participants[self.phone_number]
        if participant.call_status == self.status:
            return

        logger.info("call_status_change: phone=<masked> status=%s conf=%s", self.status, self.conf_call.conf_id)
        participant.call_status = self.status

        is_teacher = (
            self.conf_call.state.get_teacher() is not None
            and self.conf_call.state.get_teacher().phone_number == participant.phone_number
        )

        connected_numbers = [
            num for num, p in self.conf_call.state.participants.items()
            if p.call_status == CallStatus.CONNECTED
        ]

        if self.status == CallStatus.CONNECTED:
            recipients = [n for n in connected_numbers if n != participant.phone_number]
            try:
                join_text = "Teacher has joined" if is_teacher else f"{participant.name} has joined"
                if recipients:
                    await self.conf_call.communication_api.play_announcement_to_conference(join_text, recipients)
                if not is_teacher:
                    teacher = self.conf_call.state.get_teacher()
                    if teacher and teacher.call_status == CallStatus.CONNECTED:
                        await self.conf_call.communication_api.play_announcement_to_conference(
                            "Teacher is in the conference", [participant.phone_number]
                        )
            except Exception as exc:
                logger.error("call_status_change: join TTS failed — %s", exc)

            if is_teacher and self.conf_call.state.auto_end_state.is_active:
                from app.services.confevents.teacher_disconnect_timer_event import CancelTeacherDisconnectTimerEvent  # noqa: PLC0415
                await self.conf_call.queue_event(CancelTeacherDisconnectTimerEvent(self.conf_call))

        if self.status == CallStatus.DISCONNECTED:
            recipients = [n for n in connected_numbers if n != participant.phone_number]
            try:
                leave_text = "Teacher has left" if is_teacher else f"{participant.name} has left"
                if recipients:
                    await self.conf_call.communication_api.play_announcement_to_conference(leave_text, recipients)
            except Exception as exc:
                logger.error("call_status_change: leave TTS failed — %s", exc)

            if is_teacher:
                await self.conf_call.stream_system_message(SystemAudioMessages.TEACHER_HAS_DROPPED)
                from app.services.confevents.teacher_disconnect_timer_event import StartTeacherDisconnectTimerEvent  # noqa: PLC0415
                await self.conf_call.queue_event(StartTeacherDisconnectTimerEvent(self.conf_call))

        await self.conf_call.update_state()
