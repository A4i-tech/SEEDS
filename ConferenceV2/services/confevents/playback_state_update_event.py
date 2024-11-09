from models.audio_content_state import ContentStatus
from services.conference_call import ConferenceCall
from services.confevents.base_event import ConferenceEvent
from conf_logger import logger_instance


class PlaybackStateUpdateEvent(ConferenceEvent):
    def __init__(self, content_state: ContentStatus, conf_call: ConferenceCall):
        self.content_state = content_state
        self.conf_call =  conf_call

    async def execute_event(self):
        self.conf_call.state.audio_content_state.status = self.content_state
        # Update the conference call state
        await self.conf_call.update_state()
