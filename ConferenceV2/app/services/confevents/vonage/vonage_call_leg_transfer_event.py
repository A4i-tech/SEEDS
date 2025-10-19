from app.models.participant import Participant
from app.models.system_audio_messages import SystemAudioMessages
from app.services.communication_api.vonage_api import VonageAPI
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance

class VonageCallTransferEvent(ConferenceEvent):
    """
    Only executed when CommunicationAPI is VonageAPI
    """
    def __init__(self, conf_call: ConferenceCall, conversation_uuid_from: str, type: str, uuid: str, conversation_uuid_to: str, timestamp: str):
        self.conf_call = conf_call
        self.conversation_uuid_from = conversation_uuid_from
        self.type = type
        self.uuid = uuid
        self.conversation_uuid_to = conversation_uuid_to
        self.timestamp = timestamp
    
    async def execute_event(self):
        comm_api = self.conf_call.communication_api
        if isinstance(comm_api, VonageAPI):
            is_websocket_connected_before = comm_api.get_is_websocket_connected()
            ph_number = await comm_api.handle_call_transfer_event(self.uuid, self.conversation_uuid_to)
            # Stream appropriate system message to conference call
            if ph_number:
                participant: Participant = self.conf_call.state.participants[ph_number]
                is_teacher = self.conf_call.state.get_teacher().phone_number == participant.phone_number
                if is_teacher:
                    message = SystemAudioMessages.TEACHER_HAS_JOINED
                else:
                    message = SystemAudioMessages.STUDENT_HAS_JOINED
                
                if is_websocket_connected_before and self.conversation_uuid_to == comm_api.vonage_conv_id:
                    await self.conf_call.stream_system_message(message)
    
    def __str__(self) -> str:
        return f"conversation_uuid_from: {self.conversation_uuid_from} uuid: {self.uuid} conversation_uuid_to: {self.conversation_uuid_to}"
                        