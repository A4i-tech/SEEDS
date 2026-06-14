"""Sink conference event — tears down conference after all participants have left."""
from __future__ import annotations
from datetime import datetime
from typing import TYPE_CHECKING, Callable
from app.models.action_history import ActionHistory, ActionType
from app.services.confevents.base_event import ConferenceEvent
if TYPE_CHECKING:
    from app.services.conference_service import ConferenceCall

class SinkConferenceEvent(ConferenceEvent):
    def __init__(self, conf_call: "ConferenceCall", on_sink_callback: Callable[[], None]) -> None:
        self.conf_call = conf_call
        self.on_sink_callback = on_sink_callback

    async def execute_event(self) -> None:
        self.conf_call.state.is_running = False
        self.conf_call.state.action_history.append(ActionHistory(timestamp=datetime.now().isoformat(), action_type=ActionType.CONFERENCE_SINK, metadata={}, owner=self.conf_call.state.teacher_phone_number or ""))
        await self.conf_call.update_state()
        self.conf_call.stop_remote_audio_relay()
        self.conf_call.schedule_capture_finalize()
        self.conf_call.end_processing_conf_events_from_queue()
        if self.conf_call.connection_manager:
            await self.conf_call.connection_manager.disconnect(self.conf_call.state.get_teacher())
        if self.on_sink_callback:
            self.on_sink_callback()
