from datetime import datetime
from pydantic import BaseModel

from app.models.action_history import ActionHistory, ActionType
from app.models.audio_content_state import ContentStatus
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.singletons.websocket_service import WebsocketService

class ResumeContentEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall):
        self.conf_call = conf_call

    async def execute_event(self):
        # Update the audio content state with the current URL and status
        self.conf_call.state.audio_content_state.status = ContentStatus.STARTING

        # Send Play Message to NodeJS websocket service
        ws = WebsocketService()
        await ws.send_message(WebsocketServiceMessage(
                                websocket_id=self.conf_call.conf_id,
                                type=MessageType.RESUME_AUDIO,
                            )) 
        
        # Log the action in the action history
        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE,
                metadata={
                    "playback_status": self.conf_call.state.audio_content_state.__dict__  # Using __dict__ to mimic model_dump
                },
                owner=self.conf_call.state.teacher_phone_number
            )
        )
        
        # Update the conference call state
        await self.conf_call.update_state()