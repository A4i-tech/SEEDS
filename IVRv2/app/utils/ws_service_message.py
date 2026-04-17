"""
WebSocket service message models for IVRv2.

Defines message types and structure for communicating with the websocket-service
via control WebSocket connection.
"""

from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class MessageType(str, Enum):
    """Message types for WebSocket service communication."""
    HEARTBEAT = "ping"
    SET_SPEED = "set-speed"
    STOP_AUDIO = "stop"
    PAUSE_AUDIO = "pause"
    RESUME_AUDIO = "resume"
    DISCONNECT = "disconnect"


class WebsocketServiceMessage(BaseModel):
    """Message format for WebSocket service control commands."""
    websocket_id: str
    type: MessageType
    message: str = ""
    speed: Optional[float] = Field(default=None, ge=0.75, le=2.0)
