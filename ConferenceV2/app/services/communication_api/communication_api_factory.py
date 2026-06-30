# Enum for animal types
import base64
from enum import Enum
import os
from app.services.communication_api import CommunicationAPI
from dotenv import load_dotenv
load_dotenv()

class CommunicationAPIType(Enum):
    VONAGE = "vonage"
    FAKE = "fake"

class CommunicationAPIFactory:
    @staticmethod
    def create(type: CommunicationAPIType, conf_id: str, ws_url: str) -> CommunicationAPI:
        from app.services.communication_api import VonageAPI
        
        if type == CommunicationAPIType.VONAGE:
            raw_key = base64.b64decode(os.environ.get("VONAGE_APPLICATION_PRIVATE_KEY64")).decode("utf-8")
            return VonageAPI(application_id=os.environ.get("VONAGE_APPLICATION_ID"),
                             private_key_path=raw_key,
                             vonage_number=os.environ.get("VONAGE_NUMBER"),
                             conf_id=conf_id, 
                             ws_server_url=ws_url)
        elif type == CommunicationAPIType.FAKE:
            from app.services.communication_api.fake_communication_api import FakeCommunicationAPI
            return FakeCommunicationAPI(conf_id=conf_id)
        else:
            raise ValueError(f"Unknown COMM API type: {type}")
