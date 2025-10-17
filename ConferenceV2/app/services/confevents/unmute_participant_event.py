from datetime import datetime
from app.models.action_history import ActionHistory, ActionType
from app.models.system_audio_messages import SystemAudioMessages
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.singletons.websocket_service import WebsocketService


class UnmuteParticipantEvent(ConferenceEvent):
    def __init__(self, phone_number: str, conf_call: ConferenceCall):
        self.phone_number = phone_number
        self.conf_call = conf_call

    async def execute_event(self):
        # TODO: Speak out announcement messages in conversation through comm API, check if the participant is already unmuted
        if self.phone_number in self.conf_call.state.participants:
            participant = self.conf_call.state.participants[self.phone_number]
            
            # Unmute the participant via communication API
            await self.conf_call.communication_api.unmute_participant(self.phone_number)
            
            # Update participant's mute status
            participant.is_muted = False
            # Set raised hand to false
            participant.is_raised = False
            participant.raised_at = -1
            
            if self.phone_number != self.conf_call.state.get_teacher().phone_number:
                await self.conf_call.stream_system_message(SystemAudioMessages.STUDENT_IS_UNMUTED)
            
            # Log the unmute action in the action history
            self.conf_call.state.action_history.append(
                ActionHistory(
                    timestamp=datetime.now().isoformat(),
                    action_type=ActionType.TEACHER_MUTE_UNMUTE_STUDENT,
                    metadata={
                        "phone_number": self.phone_number,
                        "is_muted": False
                    },
                    owner=self.conf_call.state.teacher_phone_number
                )
            )
            
            # Update the conference call state
            await self.conf_call.update_state()
