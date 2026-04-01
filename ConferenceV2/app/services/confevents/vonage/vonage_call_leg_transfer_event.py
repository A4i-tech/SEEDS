from app.models.participant import Participant
from app.services.communication_api.vonage_api import VonageAPI
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance


class VonageCallTransferEvent(ConferenceEvent):
    """
    Only executed when CommunicationAPI is VonageAPI
    """

    def __init__(
        self,
        conf_call: ConferenceCall,
        conversation_uuid_from: str,
        type: str,
        uuid: str,
        conversation_uuid_to: str,
        timestamp: str,
    ):
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
            ph_number = await comm_api.handle_call_transfer_event(
                self.uuid, self.conversation_uuid_to
            )
            if ph_number:
                logger_instance.info("Participant transferred into conference", ph_number)

    def __str__(self) -> str:
        return f"conversation_uuid_from: {self.conversation_uuid_from} uuid: {self.uuid} conversation_uuid_to: {self.conversation_uuid_to}"
