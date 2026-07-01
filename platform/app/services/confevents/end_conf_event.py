"""End conference event."""
from __future__ import annotations

import logging
from datetime import datetime
from typing import TYPE_CHECKING

from app.models.action_history import ActionHistory, ActionType
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.confevents.base_event import ConferenceEvent

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall
logger = logging.getLogger(__name__)

class EndConferenceEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall) -> None:
        self.conf_call = conf_call

    async def execute_event(self) -> None:
        self.conf_call.state.is_running = False
        await self.conf_call.communication_api.end_conf()
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.CONFERENCE_END, metadata={}, owner=self.conf_call.state.teacher_phone_number or ""))
        self.conf_call.stop_remote_audio_relay()
        self.conf_call.schedule_capture_finalize()
        await self.conf_call.close_websocket()
        try:
            from app.providers.websocket_client import WebsocketClientProvider  # noqa: PLC0415
            ws = WebsocketClientProvider()
            await ws.send_message(WebsocketServiceMessage(websocket_id=self.conf_call.conf_id, type=MessageType.DISCONNECT))
        except Exception as exc:
            logger.warning("end_conf_event: websocket disconnect failed — %s", exc)
        await self.conf_call.update_state()
