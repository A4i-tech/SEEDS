from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    HEARTBEAT = "ping"
    PLAY_AUDIO = "play"
    PLAY_SYSTEM_MESSAGE = "play-system-message"
    PAUSE_AUDIO = "pause"
    RESUME_AUDIO = "resume"
    STOP_AUDIO = "stop"
    PLAYBACK_STATE_UPDATES = "playback-state-update"
    SEEK_AUDIO = "seek"
    SET_SPEED = "set-speed"
    DISCONNECT = "disconnect"
    RECONNECT = "reconnect"


class WebsocketServiceMessage(BaseModel):
    websocket_id: str
    type: MessageType
    message: str = ""
    position_seconds: Optional[float] = Field(default=None, ge=0)
    duration_seconds: Optional[float] = Field(default=None, ge=0)
    speed: Optional[float] = Field(default=None, ge=0.5, le=2.0)
