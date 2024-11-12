from enum import Enum
from pydantic import BaseModel, Field, field_validator, FieldValidationInfo

from models.audio_content_state import ContentStatus


class MessageType(str, Enum):
    HEARTBEAT = "ping"
    PLAY_AUDIO = "play"
    PAUSE_AUDIO = "pause"
    RESUME_AUDIO = "resume"
    STOP_AUDIO = "stop"
    PLAYBACK_STATE_UPDATES = "playback-state-update"
    DISCONNECT = "disconnect"
    RECONNECT = "reconnect"
    
class WebsocketServiceMessage(BaseModel):
    websocket_id: str
    type: MessageType
    message: str = ""
