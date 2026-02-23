# services/conference_call_manager.py
import asyncio
from typing import Dict, List
import uuid
import os

from dotenv import load_dotenv
from app.services.communication_api import CommunicationAPIFactory, CommunicationAPIType
from app.services.storage_manager import StorageManager, create_storage_manager
from app.services.smartphone_connection_manager import SmartphoneConnectionManagerType, SmartphoneConnectionManagerFactory
from app.services.conference_call import ConferenceCall
from app.conf_logger import logger_instance

load_dotenv()

class ConferenceCallManager:
    def __init__(
        self,
        communication_api_type: CommunicationAPIType,
        smartphone_connection_manager_type: SmartphoneConnectionManagerType,
        storage_manager: StorageManager,
    ):
        self.communication_api_type = communication_api_type
        self.smartphone_connection_manager_type = smartphone_connection_manager_type
        self.storage_manager = storage_manager
        self.communication_api_factory = CommunicationAPIFactory()
        self.smartphone_connection_manager_factory = SmartphoneConnectionManagerFactory()
        self.conferences: Dict[str, ConferenceCall] = {}
        self.ws_base_url = os.environ.get("WS_SERVER_EP", "")

    def create_conference(self, teacher_phone: str, student_phones: List[str]) -> ConferenceCall:
        conf_id = str(uuid.uuid4())
        conference_call = ConferenceCall(
            conf_id=conf_id,
            communication_api=self.communication_api_factory.create(self.communication_api_type, 
                                                                    conf_id, 
                                                                    ws_url=f"{self.ws_base_url}?id={conf_id}"),
            connection_manager=self.smartphone_connection_manager_factory.create(self.smartphone_connection_manager_type, 
                                                                                 conf_id),
            storage_manager=self.storage_manager
        )
        conference_call.set_participant_state(teacher_phone, student_phones)
        self.conferences[conf_id] = conference_call
        return conference_call
   
    async def start_conference_call(self, conf_id: str) -> None:
        conf: ConferenceCall = self.get_conference(conf_id)
        if not conf:
            raise ValueError(f"No such conference has been created; ID: {conf_id}")
        
        conf.start_processing_conf_events_from_queue()
        await conf.start_conference()
        
    def get_conference(self, conference_id: str) -> ConferenceCall | None:
        return self.conferences.get(conference_id, None)

    def delete_conference(self, conf_id: str):
        del self.conferences[conf_id]

    def get_conference_from_phone_number(self, phone_number: str) -> ConferenceCall | None:
        for conf in self.conferences.values():
            participant_phone_numbers = conf.state.participants.keys()
            if phone_number in participant_phone_numbers:
                return conf
        return None

# UNIVERSAL ConferenceCallManager instance
conference_manager = ConferenceCallManager(
    communication_api_type=CommunicationAPIType.VONAGE,
    smartphone_connection_manager_type=SmartphoneConnectionManagerType.SSE,
    storage_manager=create_storage_manager(),
)
