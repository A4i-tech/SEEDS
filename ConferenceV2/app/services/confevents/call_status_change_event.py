import asyncio
from app.models.participant import CallStatus, Participant
from app.models.system_audio_messages import SystemAudioMessages
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance
from app.services.caller_state_manager import caller_state_manager
import asyncio

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
                    is_teacher = self.conf_call.state.get_teacher().phone_number == participant.phone_number
                    if is_teacher:
                        await self.conf_call.stream_system_message(SystemAudioMessages.TEACHER_HAS_DROPPED)
                    else:
                        await self.conf_call.stream_system_message(SystemAudioMessages.STUDENT_HAS_DROPPED) 
                    
                await self.conf_call.update_state()

                new_state_update = {}
                
                # Translate your internal CallStatus to a simple state for the client
                if self.status == CallStatus.CONNECTED:
                    new_state_update = {"connected": True}
                elif self.status == CallStatus.DISCONNECTED:
                    new_state_update = {"connected": False}
                
                # If there's a state we want to share, send the update.
                if new_state_update:
                    asyncio.create_task(
                        caller_state_manager.update_state(
                            conference_id=self.conf_call.conf_id,
                            participant_id=self.phone_number,
                            new_state=new_state_update
                        )
                    )
