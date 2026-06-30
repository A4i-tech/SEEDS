"""Reconnect communication API websocket event."""
from __future__ import annotations

from typing import TYPE_CHECKING

from app.services.confevents.base_event import ConferenceEvent

if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

class ReconnectCommApiWebsocketEvent(ConferenceEvent):
    def __init__(self, conf_call: ConferenceCall) -> None:
        self.conf_call = conf_call

    async def execute_event(self) -> None:
        await self.conf_call.on_websocket_disconnect_callback()
