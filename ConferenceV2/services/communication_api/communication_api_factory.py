# Enum for animal types
from enum import Enum
import os
from services.communication_api import CommunicationAPI
from dotenv import load_dotenv
load_dotenv()

class CommunicationAPIType(Enum):
    VONAGE = "vonage"

class DummyAPI(CommunicationAPI):
    async def start_conf(self, teacher_phone: str, student_phones: list) -> str:
        return "dummy_conf_id"
    async def end_conf(self):
        pass
    def reconnect_websocket(self):
        pass
    def get_is_websocket_connected(self) -> bool:
        return False
    async def add_participant(self, phone_number: str):
        pass
    async def remove_participant(self, phone_number: str):
        pass
    async def mute_participant(self, phone_number: str):
        pass
    async def unmute_participant(self, phone_number: str):
        pass

class CommunicationAPIFactory:
    @staticmethod
    def create(type: CommunicationAPIType, conf_id: str, ws_url: str) -> CommunicationAPI:
        from services.communication_api import VonageAPI
        key_path = os.environ.get("VONAGE_PRIVATE_KEY_PATH")
        if type == CommunicationAPIType.VONAGE:
            if key_path and os.path.exists(key_path):
                return VonageAPI(application_id=os.environ.get("VONAGE_APPLICATION_ID"),
                                 private_key_path=key_path,
                                 vonage_number=os.environ.get("VONAGE_NUMBER"),
                                 conf_id=conf_id,
                                 ws_server_url=ws_url)
            else:
                return DummyAPI()
        else:
            raise ValueError(f"Unknown COMM API type: {type}")
