from app.models.audio_content_state import ContentStatus
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.conf_logger import logger_instance


class ReconnectCommApiWebsocketEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall):
        self.conf_call =  conf_call

    async def execute_event(self):
        await self.conf_call.on_websocket_disconnect_callback()
