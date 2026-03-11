from app.models.participant import CallStatus, Participant
from app.models.system_audio_messages import SystemAudioMessages
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.confevents.teacher_disconnect_timer_event import (
    StartTeacherDisconnectTimerEvent,
    CancelTeacherDisconnectTimerEvent
)
from app.conf_logger import logger_instance


class CallStatusChangeEvent(ConferenceEvent):
    def __init__(self, phone_number: str, status: CallStatus, conf_call: ConferenceCall):
        self.phone_number = phone_number
        self.status = status
        self.conf_call = conf_call

    async def execute_event(self):
        if self.phone_number in self.conf_call.state.participants:
            participant: Participant = self.conf_call.state.participants[self.phone_number]
            if participant.call_status != self.status:
                logger_instance.info("EXECUTING CALL STATUS CHANGE EVENT FOR NUMBER", self.phone_number, "STATUS:", self.status.value)
                participant.call_status = self.status

                # Check if this is the teacher
                is_teacher = (
                    self.conf_call.state.get_teacher() and
                    self.conf_call.state.get_teacher().phone_number == participant.phone_number
                )

                # Teacher disconnected → start timer
                if self.status == CallStatus.DISCONNECTED and is_teacher:
                    logger_instance.info(f"Teacher disconnected from {self.conf_call.conf_id}")
                    timer_event = StartTeacherDisconnectTimerEvent(self.conf_call)
                    await self.conf_call.queue_event(timer_event)

                # Teacher reconnected → cancel timer
                elif self.status == CallStatus.CONNECTED and is_teacher:
                    logger_instance.info(f"Teacher reconnected to {self.conf_call.conf_id}")
                    if self.conf_call.state.auto_end_state.is_active:
                        cancel_event = CancelTeacherDisconnectTimerEvent(self.conf_call)
                        await self.conf_call.queue_event(cancel_event)

                await self.conf_call.update_state()
