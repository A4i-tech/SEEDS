"""Playback state update event — inbound from websocket-service."""
from __future__ import annotations
from typing import TYPE_CHECKING, Optional
from app.models.playback_state import ContentStatus
from app.services.confevents.base_event import ConferenceEvent
if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

class PlaybackStateUpdateEvent(ConferenceEvent):
    def __init__(self, conf_call: "ConferenceCall", content_state: ContentStatus, position_seconds: Optional[float] = None, duration_seconds: Optional[float] = None, speed: Optional[float] = None) -> None:
        self.conf_call = conf_call
        self.content_state = content_state
        self.position_seconds = position_seconds
        self.duration_seconds = duration_seconds
        self.speed = speed

    async def execute_event(self) -> None:
        state = self.conf_call.state.audio_content_state
        state.status = self.content_state
        if self.position_seconds is not None:
            state.position_seconds = self.position_seconds
        if self.duration_seconds is not None:
            state.duration_seconds = self.duration_seconds
        if self.speed is not None:
            state.speed = self.speed
        await self.conf_call.update_state()
