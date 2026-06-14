"""Seek content event."""
from __future__ import annotations
import json
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from app.models.action_history import ActionHistory, ActionType
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.confevents.base_event import ConferenceEvent
if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

class SeekContentEvent(ConferenceEvent):
    def __init__(self, conf_call: "ConferenceCall", delta_seconds: Optional[int] = None, position_seconds: Optional[float] = None, initiator_phone: Optional[str] = None) -> None:
        if delta_seconds is None and position_seconds is None:
            raise ValueError("Exactly one of delta_seconds or position_seconds must be provided")
        self.conf_call = conf_call
        self.delta_seconds = delta_seconds
        self.position_seconds = position_seconds
        self.initiator_phone = initiator_phone

    async def execute_event(self) -> None:
        if self.position_seconds is not None:
            payload = {"positionSeconds": self.position_seconds}
            metadata = {"seek_position_seconds": self.position_seconds}
        else:
            payload = {"deltaSeconds": self.delta_seconds}
            metadata = {"seek_delta_seconds": self.delta_seconds}
        from app.providers.websocket_client import WebsocketClientProvider  # noqa: PLC0415
        ws = WebsocketClientProvider()
        await ws.send_message(WebsocketServiceMessage(websocket_id=self.conf_call.conf_id, type=MessageType.SEEK_AUDIO, message=json.dumps(payload)))
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.LEADER_SEEK_CONTENT_VIA_DTMF if self.initiator_phone else ActionType.TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE, metadata=metadata, owner=self.initiator_phone or self.conf_call.state.teacher_phone_number or ""))
        await self.conf_call.update_state()
