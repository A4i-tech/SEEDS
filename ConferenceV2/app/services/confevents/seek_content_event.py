from datetime import datetime
import json

from app.models.action_history import ActionHistory, ActionType
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.singletons.websocket_service import WebsocketService


class SeekContentEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall, delta_seconds: int):
        self.conf_call = conf_call
        self.delta_seconds = delta_seconds

    async def execute_event(self):
        ws = WebsocketService()
        await ws.send_message(
            WebsocketServiceMessage(
                websocket_id=self.conf_call.conf_id,
                type=MessageType.SEEK_AUDIO,
                # Send the payload as a JSON-encoded string so the
                # `message` field remains a `str` across services.
                message=json.dumps({"deltaSeconds": self.delta_seconds}),
            )
        )

        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE,
                metadata={"seek_delta_seconds": self.delta_seconds},
                owner=self.conf_call.state.teacher_phone_number,
            )
        )

        # Leave audio_content_state untouched; websocket-service will send the
        # authoritative playback-state update once the seek completes.
        await self.conf_call.update_state()
