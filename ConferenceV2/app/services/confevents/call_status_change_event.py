from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.participant import CallStatus, Participant
from app.models.system_audio_messages import SystemAudioMessages
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
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
                
                # Stream participant disconnected message
                if self.status == CallStatus.DISCONNECTED:
                    is_teacher = self.conf_call.state.get_teacher() and self.conf_call.state.get_teacher().phone_number == participant.phone_number
                    if is_teacher:
                        await self.conf_call.stream_system_message(SystemAudioMessages.TEACHER_HAS_DROPPED)
                    # Auto-revoke leader when leader disconnects
                    if self.phone_number == self.conf_call.state.leader_phone_number:
                        self.conf_call.state.leader_phone_number = None
                        self.conf_call.state.action_history.append(
                            ActionHistory(
                                timestamp=datetime.now().isoformat(),
                                action_type=ActionType.LEADER_DISCONNECTED,
                                metadata={"leader_phone_number": self.phone_number},
                                owner=self.phone_number,
                            )
                        )

                await self.conf_call.update_state()
