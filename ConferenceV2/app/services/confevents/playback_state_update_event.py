from typing import Optional

from app.models.audio_content_state import ContentStatus
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance


class PlaybackStateUpdateEvent(ConferenceEvent):
    def __init__(
        self,
        content_state: ContentStatus,
        conf_call: ConferenceCall,
        position_seconds: Optional[float] = None,
        duration_seconds: Optional[float] = None,
        speed: Optional[float] = None,
    ):
        self.content_state = content_state
        self.conf_call = conf_call
        self.position_seconds = position_seconds
        self.duration_seconds = duration_seconds
        self.speed = speed

    async def execute_event(self):
        audio_state = self.conf_call.state.audio_content_state
        audio_state.status = self.content_state
        if self.position_seconds is not None:
            audio_state.position_seconds = self.position_seconds
        if self.duration_seconds is not None:
            audio_state.duration_seconds = self.duration_seconds
        if self.speed is not None:
            audio_state.speed = self.speed
        await self.conf_call.update_state()
