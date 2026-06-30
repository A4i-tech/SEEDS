"""Play content event."""
from __future__ import annotations

from datetime import datetime
from typing import TYPE_CHECKING

from app.models.action_history import ActionHistory, ActionType
from app.models.playback_state import ContentStatus
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.confevents.base_event import ConferenceEvent

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

class PlayContentEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall, url: str) -> None:
        self.url = url
        self.conf_call = conf_call

    async def execute_event(self) -> None:
        self.conf_call.state.audio_content_state.current_url = self.url
        self.conf_call.state.audio_content_state.status = ContentStatus.STARTING
        from app.providers.websocket_client import WebsocketClientProvider  # noqa: PLC0415
        ws = WebsocketClientProvider()
        await ws.send_message(WebsocketServiceMessage(websocket_id=self.conf_call.conf_id, type=MessageType.PLAY_AUDIO, message=self.url))
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE, metadata={"url": self.url}, owner=self.conf_call.state.teacher_phone_number or ""))
        await self.conf_call.update_state()
