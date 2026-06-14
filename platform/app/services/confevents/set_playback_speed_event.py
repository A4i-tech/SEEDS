"""Set playback speed event."""
from __future__ import annotations
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from app.models.action_history import ActionHistory, ActionType
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.confevents.base_event import ConferenceEvent
if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

class SetPlaybackSpeedEvent(ConferenceEvent):
    def __init__(self, conf_call: "ConferenceCall", speed: float, initiator_phone: Optional[str] = None) -> None:
        if not (0.5 <= speed <= 2.0):
            raise ValueError(f"speed must be 0.5-2.0, got {speed}")
        self.conf_call = conf_call
        self.speed = speed
        self.initiator_phone = initiator_phone

    async def execute_event(self) -> None:
        from app.providers.websocket_client import WebsocketClientProvider  # noqa: PLC0415
        ws = WebsocketClientProvider()
        await ws.send_message(WebsocketServiceMessage(websocket_id=self.conf_call.conf_id, type=MessageType.SET_SPEED, message=str(self.speed)))
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.LEADER_SET_SPEED_VIA_DTMF if self.initiator_phone else ActionType.TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE, metadata={"playback_speed": self.speed}, owner=self.initiator_phone or self.conf_call.state.teacher_phone_number or ""))
        self.conf_call.state.audio_content_state.speed = self.speed
        await self.conf_call.update_state()
