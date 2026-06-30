from datetime import datetime
import json
from typing import Optional

from app.models.action_history import ActionHistory, ActionType
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.conference_call import ConferenceCall
from app.services.confevents.base_event import ConferenceEvent
from app.services.singletons.websocket_service import WebsocketService


class SeekContentEvent(ConferenceEvent):
    def __init__(
        self,
        conf_call: ConferenceCall,
        delta_seconds: Optional[int] = None,
        position_seconds: Optional[float] = None,
        initiator_phone: Optional[str] = None,
    ):
        if delta_seconds is None and position_seconds is None:
            raise ValueError("Exactly one of delta_seconds or position_seconds must be provided")
        self.conf_call = conf_call
        self.delta_seconds = delta_seconds
        self.position_seconds = position_seconds
        self.initiator_phone = initiator_phone

    async def execute_event(self):
        if self.position_seconds is not None:
            seek_payload = {"positionSeconds": self.position_seconds}
            metadata = {"seek_position_seconds": self.position_seconds}
        else:
            seek_payload = {"deltaSeconds": self.delta_seconds}
            metadata = {"seek_delta_seconds": self.delta_seconds}

        ws = WebsocketService()
        await ws.send_message(
            WebsocketServiceMessage(
                websocket_id=self.conf_call.conf_id,
                type=MessageType.SEEK_AUDIO,
                message=json.dumps(seek_payload),
            )
        )

        self.conf_call.state.action_history.append(
            ActionHistory(
                timestamp=datetime.now().isoformat(),
                action_type=ActionType.LEADER_SEEK_CONTENT_VIA_DTMF if self.initiator_phone else ActionType.TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE,
                metadata=metadata,
                owner=self.initiator_phone or self.conf_call.state.teacher_phone_number,
            )
        )

        # Leave audio_content_state untouched; websocket-service will send the
        # authoritative playback-state update once the seek completes.
        await self.conf_call.update_state()
