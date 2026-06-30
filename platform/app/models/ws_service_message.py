"""WebSocket service message envelope (from ConferenceV2 models/ws_service_message.py)."""
from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class MessageType(StrEnum):
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
    AUDIO_DATA = "AUDIO_DATA"


class WebsocketServiceMessage(BaseModel):
    """Envelope for messages exchanged with the websocket-service sidecar."""

    model_config = ConfigDict(populate_by_name=True)

    websocket_id: str
    type: MessageType
    message: str = ""
    position_seconds: float | None = Field(default=None, ge=0)
    duration_seconds: float | None = Field(default=None, ge=0)
    speed: float | None = Field(default=None, ge=0.5, le=2.0)
