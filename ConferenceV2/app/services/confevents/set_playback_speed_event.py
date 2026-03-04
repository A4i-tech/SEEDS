from datetime import datetime

from app.models.action_history import ActionHistory, ActionType
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.singletons.websocket_service import WebsocketService


class SetPlaybackSpeedEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall, speed: float):
        if not (0.5 <= speed <= 2.0):
            raise ValueError(f"speed must be between 0.5 and 2.0, got {speed}")
        self.conf_call = conf_call
        self.speed = speed

    async def execute_event(self):
        ws = WebsocketService()
        await ws.send_message(
            WebsocketServiceMessage(
                websocket_id=self.conf_call.conf_id,
                type=MessageType.SET_SPEED,
                message=str(self.speed),
            )
        )

        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE,
                metadata={"playback_speed": self.speed},
                owner=self.conf_call.state.teacher_phone_number,
            )
        )

        self.conf_call.state.audio_content_state.speed = self.speed
        await self.conf_call.update_state()
