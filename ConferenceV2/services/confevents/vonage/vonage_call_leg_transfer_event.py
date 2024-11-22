from services.communication_api.vonage_api import VonageAPI
from services.conference_call import ConferenceCall
from services.confevents.base_event import ConferenceEvent

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
        if isinstance(self.conf_call.communication_api, VonageAPI):
            ph_number = await self.conf_call.communication_api.handle_call_transfer_event(self.uuid, self.conversation_uuid_to)
            # Stream appropriate system message to conference call
            # if ph_number:
            #     participant: Participant = self.conf_call.state.participants[ph_number]
            #     is_teacher = self.conf_call.state.get_teacher() == participant.phone_number
            #     if is_teacher:
            #         message_url = SystemAudioMessages.TEACHER_HAS_JOINED.value
            #     else:
            #         message_url = SystemAudioMessages.STUDENT_HAS_JOINED.value
            #     logger_instance.info("Streaming System Audio: ", message_url)
            #     ws = WebsocketService()
            #     await ws.send_message(WebsocketServiceMessage(
            #                                 websocket_id=self.conf_call.conf_id,
            #                                 type=MessageType.PLAY_AUDIO,
            #                                 message = message_url
            #                             )) 
    
    def __str__(self) -> str:
        return f"conversation_uuid_from: {self.conversation_uuid_from} uuid: {self.uuid} conversation_uuid_to: {self.conversation_uuid_to}"
                        