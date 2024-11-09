from models.audio_content_state import ContentStatus
from services.conference_call import ConferenceCall
from services.confevents.base_event import ConferenceEvent
from conf_logger import logger_instance


class ReconnectCommApiWebsocketEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall):
        self.conf_call =  conf_call

    async def execute_event(self):
        await self.conf_call.on_websocket_disconnect_callback()
