from enum import Enum

from pydantic import BaseModel


class MessageType(str, Enum):
    HEARTBEAT = "ping"
    PLAY_AUDIO = "play"
    PLAY_SYSTEM_MESSAGE = "play-system-message"
    PAUSE_AUDIO = "pause"
    RESUME_AUDIO = "resume"
    STOP_AUDIO = "stop"
    PLAYBACK_STATE_UPDATES = "playback-state-update"
    SEEK_AUDIO = "seek"
    DISCONNECT = "disconnect"
    RECONNECT = "reconnect"


class WebsocketServiceMessage(BaseModel):
    websocket_id: str
    type: MessageType
    message: str = ""
