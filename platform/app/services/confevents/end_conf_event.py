"""End conference event."""
from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import datetime
from typing import TYPE_CHECKING

from app.models.action_history import ActionHistory, ActionType
from app.models.ws_service_message import MessageType, WebsocketServiceMessage
from app.services.confevents.base_event import ConferenceEvent

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall
logger = logging.getLogger(__name__)

class EndConferenceEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall, on_end_callback: Callable[[], None] | None = None) -> None:
        self.conf_call = conf_call
        self.on_end_callback = on_end_callback

    async def execute_event(self) -> None:
        try:
            await self._end_conference()
        finally:
            try:
                if self.conf_call.connection_manager:
                    await self.conf_call.connection_manager.disconnect(self.conf_call.state.get_teacher())
            finally:
                try:
                    if self.on_end_callback:
                        self.on_end_callback()
                finally:
                    self.conf_call.end_processing_conf_events_from_queue()

    async def _end_conference(self) -> None:
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
