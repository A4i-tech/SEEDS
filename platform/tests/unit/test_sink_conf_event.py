"""Coverage for app.services.confevents.sink_conf_event.SinkConferenceEvent."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from app.models.action_history import ActionType
from app.services.confevents.sink_conf_event import SinkConferenceEvent


def _make_conf(connection_manager=None, teacher_phone="+111"):
    conf = MagicMock()
    conf.state = MagicMock()
    conf.state.is_running = True
    conf.state.action_history = []
    conf.state.teacher_phone_number = teacher_phone
    conf.state.get_teacher.return_value = "teacher-obj"
    conf.update_state = AsyncMock()
    conf.stop_remote_audio_relay = MagicMock()
    conf.schedule_capture_finalize = MagicMock()
    conf.end_processing_conf_events_from_queue = MagicMock()
    conf.connection_manager = connection_manager
    return conf


class TestSinkConferenceEvent:
    async def test_marks_conference_not_running(self) -> None:
        conf = _make_conf()
        event = SinkConferenceEvent(conf, on_sink_callback=None)

        await event.execute_event()

        assert conf.state.is_running is False

    async def test_appends_action_history(self) -> None:
        conf = _make_conf(teacher_phone="+999")
        event = SinkConferenceEvent(conf, on_sink_callback=None)

        await event.execute_event()

        assert len(conf.state.action_history) == 1
        entry = conf.state.action_history[0]
        assert entry.action_type == ActionType.CONFERENCE_SINK
        assert entry.owner == "+999"
        assert entry.metadata == {}

    async def test_action_history_owner_defaults_to_empty_string(self) -> None:
        conf = _make_conf(teacher_phone=None)
        event = SinkConferenceEvent(conf, on_sink_callback=None)

        await event.execute_event()

        assert conf.state.action_history[0].owner == ""

    async def test_calls_update_state(self) -> None:
        conf = _make_conf()
        event = SinkConferenceEvent(conf, on_sink_callback=None)

        await event.execute_event()

        conf.update_state.assert_awaited_once()

    async def test_stops_remote_audio_relay_and_finalizes_capture(self) -> None:
        conf = _make_conf()
        event = SinkConferenceEvent(conf, on_sink_callback=None)

        await event.execute_event()

        conf.stop_remote_audio_relay.assert_called_once()
        conf.schedule_capture_finalize.assert_called_once()
        conf.end_processing_conf_events_from_queue.assert_called_once()

    async def test_disconnects_connection_manager_when_present(self) -> None:
        conn_mgr = MagicMock()
        conn_mgr.disconnect = AsyncMock()
        conf = _make_conf(connection_manager=conn_mgr)
        event = SinkConferenceEvent(conf, on_sink_callback=None)

        await event.execute_event()

        conn_mgr.disconnect.assert_awaited_once_with("teacher-obj")

    async def test_skips_disconnect_when_no_connection_manager(self) -> None:
        conf = _make_conf(connection_manager=None)
        event = SinkConferenceEvent(conf, on_sink_callback=None)

        await event.execute_event()

        conf.state.get_teacher.assert_not_called()

    async def test_invokes_on_sink_callback_when_provided(self) -> None:
        conf = _make_conf()
        callback = MagicMock()
        event = SinkConferenceEvent(conf, on_sink_callback=callback)

        await event.execute_event()

        callback.assert_called_once_with()

    async def test_skips_callback_when_none(self) -> None:
        conf = _make_conf()
        event = SinkConferenceEvent(conf, on_sink_callback=None)

        await event.execute_event()

        conf.update_state.assert_awaited_once()
        conf.end_processing_conf_events_from_queue.assert_called_once()

    async def test_full_order_of_operations(self) -> None:
        conn_mgr = MagicMock()
        conn_mgr.disconnect = AsyncMock()
        conf = _make_conf(connection_manager=conn_mgr)
        callback = MagicMock()
        calls: list[str] = []

        conf.update_state.side_effect = lambda: calls.append("update_state")
        conf.stop_remote_audio_relay.side_effect = lambda: calls.append("stop_relay")
        conf.schedule_capture_finalize.side_effect = lambda: calls.append("schedule_finalize")
        conf.end_processing_conf_events_from_queue.side_effect = lambda: calls.append("end_processing")
        conn_mgr.disconnect.side_effect = lambda *_: calls.append("disconnect")
        callback.side_effect = lambda: calls.append("callback")

        event = SinkConferenceEvent(conf, on_sink_callback=callback)
        await event.execute_event()

        assert calls == [
            "update_state",
            "stop_relay",
            "schedule_finalize",
            "end_processing",
            "disconnect",
            "callback",
        ]
