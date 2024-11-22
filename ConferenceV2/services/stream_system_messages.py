from models.system_audio_messages import SystemAudioMessages
from models.ws_service_message import MessageType, WebsocketServiceMessage

class StreamSystemMessages:
    def __init__(self, conf_id: str):
        from services.singletons.websocket_service import WebsocketService
        
        self.ws = WebsocketService()
        self.conf_id = conf_id
    
    async def stream_message(self, audio_message: SystemAudioMessages):
        await self.ws.send_message(WebsocketServiceMessage(
                                            websocket_id=self.conf_id,
                                            type=MessageType.PLAY_SYSTEM_MESSAGE,
                                            message = audio_message.value
                                        ))