"""Resume content event."""
from __future__ import annotations
from datetime import datetime
from typing import TYPE_CHECKING, Optional
from app.models.action_history import ActionHistory, ActionType
from app.models.playback_state import ContentStatus
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.confevents.base_event import ConferenceEvent
if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

class ResumeContentEvent(ConferenceEvent):
    def __init__(self, conf_call: "ConferenceCall", initiator_phone: Optional[str] = None) -> None:
        self.conf_call = conf_call
        self.initiator_phone = initiator_phone

    async def execute_event(self) -> None:
        self.conf_call.state.audio_content_state.status = ContentStatus.STARTING
        from app.providers.websocket_client import WebsocketClientProvider  # noqa: PLC0415
        ws = WebsocketClientProvider()
        await ws.send_message(WebsocketServiceMessage(websocket_id=self.conf_call.conf_id, type=MessageType.RESUME_AUDIO))
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.LEADER_TOGGLE_CONTENT_VIA_DTMF if self.initiator_phone else ActionType.TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE, metadata={}, owner=self.initiator_phone or self.conf_call.state.teacher_phone_number or ""))
        await self.conf_call.update_state()
