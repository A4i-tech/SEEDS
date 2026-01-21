# services/conference_call_manager.py
import asyncio
from typing import Dict, List
import uuid
import os

from dotenv import load_dotenv
from app.services.communication_api import CommunicationAPIFactory, CommunicationAPIType
from app.services.storage_manager import StorageManager
from app.services.smartphone_connection_manager import SmartphoneConnectionManagerType, SmartphoneConnectionManagerFactory
from app.services.conference_call import ConferenceCall
from app.conf_logger import logger_instance
from app.services.storage_manager.in_memory_storage import InMemoryStorageManager

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
        # Cleanup stale conferences for the same teacher before creating new one
        self._cleanup_stale_conferences_for_teacher(teacher_phone)
        
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
    
    def _cleanup_stale_conferences_for_teacher(self, teacher_phone: str) -> int:
        """
        Cleanup stale conferences for a specific teacher.
        Returns number of conferences cleaned up.
        """
        cleaned_count = 0
        stale_conf_ids = []
        
        for conf_id, conf in list(self.conferences.items()):
            # Check if this conference belongs to the teacher and is stale
            if (conf.state.teacher_phone_number == teacher_phone and conf.is_stale()):
                stale_conf_ids.append(conf_id)
                cleaned_count += 1
        
        # Delete stale conferences
        for conf_id in stale_conf_ids:
            logger_instance.info(
                f"Cleaning up stale conference {conf_id} for teacher {teacher_phone}"
            )
            self.delete_conference(conf_id)
        
        if cleaned_count > 0:
            logger_instance.info(
                f"Cleaned up {cleaned_count} stale conference(s) for teacher {teacher_phone}"
            )
        
        return cleaned_count
   
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
    
    async def cleanup_all_stale_conferences(self) -> int:
        """
        Background job to cleanup all stale conferences.
        Returns number of conferences cleaned up.
        """
        cleaned_count = 0
        stale_conf_ids = []
        
        for conf_id, conf in list(self.conferences.items()):
            if conf.is_stale():
                stale_conf_ids.append(conf_id)
                cleaned_count += 1
        
        # Delete stale conferences
        for conf_id in stale_conf_ids:
            logger_instance.info(f"Background cleanup: Removing stale conference {conf_id}")
            self.delete_conference(conf_id)
        
        if cleaned_count > 0:
            logger_instance.info(f"Background cleanup: Removed {cleaned_count} stale conference(s)")
        
        return cleaned_count

# UNIVERSAL ConferenceCallManager instance
conference_manager = ConferenceCallManager(
    communication_api_type=CommunicationAPIType.VONAGE,
    smartphone_connection_manager_type=SmartphoneConnectionManagerType.SSE,
    storage_manager=InMemoryStorageManager(),
)
