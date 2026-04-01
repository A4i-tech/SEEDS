from datetime import datetime
from typing import Optional

from app.models.action_history import ActionHistory, ActionType
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.singletons.websocket_service import WebsocketService


class PauseContentEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall, initiator_phone: Optional[str] = None):
        self.conf_call = conf_call
        self.initiator_phone = initiator_phone

    async def execute_event(self):
        audio_state = self.conf_call.state.audio_content_state
        
        # Update audio content state to paused
        # audio_state.status = ContentStatus.PAUSED
        # audio_state.paused_at = datetime.now().isoformat()
        
        # Send Pause Message to NodeJS websocket service
        ws = WebsocketService() 
        await ws.send_message(WebsocketServiceMessage(
            websocket_id=self.conf_call.conf_id,
            type=MessageType.PAUSE_AUDIO,
        ))
        
        # Log the action in the action history
        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.LEADER_TOGGLE_CONTENT_VIA_DTMF if self.initiator_phone else ActionType.TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE,
                metadata={
                    "playback_status": audio_state.__dict__
                },
                owner=self.initiator_phone or self.conf_call.state.teacher_phone_number
            )
        )
        
        # Update the conference call state
        await self.conf_call.update_state()
