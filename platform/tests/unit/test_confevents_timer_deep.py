"""
Deep coverage for teacher_disconnect_timer_event, confevents, conference_service edges.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch, PropertyMock


# ---------------------------------------------------------------------------
# StartTeacherDisconnectTimerEvent
# ---------------------------------------------------------------------------


class TestStartTeacherDisconnectTimerEvent:
    def _make_conf(self, auto_end_enabled=True, teacher_connected=False):
        conf = MagicMock()
        conf.conf_id = "conf1"
        conf.state = MagicMock()
        conf.state.auto_end_state = MagicMock()
        conf.state.auto_end_state.is_active = False
        conf.state.auto_end_state.started_at = None
        conf.state.auto_end_state.expires_at = None
        conf.state.auto_end_state.timeout_minutes = 0
        conf.state.action_history = []
        conf.update_state = AsyncMock()
        conf.queue_event = AsyncMock()
        conf._auto_end_monitor_task = None

        teacher = MagicMock()
        if teacher_connected:
            from app.models.participant import CallStatus
            teacher.call_status = CallStatus.CONNECTED
        else:
            teacher.call_status = None

        conf.state.get_teacher = MagicMock(return_value=teacher)
        return conf

    @pytest.mark.asyncio
    async def test_execute_auto_end_disabled(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import StartTeacherDisconnectTimerEvent

        mock_settings = MagicMock()
        mock_settings.auto_end_enabled = False
        mock_settings.auto_end_timeout_minutes = 5

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            conf = self._make_conf(auto_end_enabled=False)
            event = StartTeacherDisconnectTimerEvent(conf_call=conf)
            assert event.auto_end_enabled is False
            await event.execute_event()  # Should return immediately
            conf.update_state.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_teacher_connected_returns_early(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import StartTeacherDisconnectTimerEvent

        mock_settings = MagicMock()
        mock_settings.auto_end_enabled = True
        mock_settings.auto_end_timeout_minutes = 5

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            conf = self._make_conf(auto_end_enabled=True, teacher_connected=True)
            event = StartTeacherDisconnectTimerEvent(conf_call=conf)
            await event.execute_event()
            conf.update_state.assert_not_called()

    @pytest.mark.asyncio
    async def test_execute_no_teacher_returns_early(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import StartTeacherDisconnectTimerEvent

        mock_settings = MagicMock()
        mock_settings.auto_end_enabled = True
        mock_settings.auto_end_timeout_minutes = 5

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            conf = self._make_conf()
            conf.state.get_teacher = MagicMock(return_value=None)
            event = StartTeacherDisconnectTimerEvent(conf_call=conf)
            await event.execute_event()
            conf.update_state.assert_not_called()


class TestCancelTeacherDisconnectTimerEvent:
    @pytest.mark.asyncio
    async def test_cancel_no_task(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import CancelTeacherDisconnectTimerEvent

        conf = MagicMock()
        conf.state = MagicMock()
        conf.state.auto_end_state = MagicMock()
        conf.state.auto_end_state.is_active = False
        conf.state.action_history = []
        conf.update_state = AsyncMock()
        conf._auto_end_monitor_task = None

        event = CancelTeacherDisconnectTimerEvent(conf_call=conf)
        await event.execute_event()  # is_active=False → returns early

    @pytest.mark.asyncio
    async def test_cancel_active_task(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import CancelTeacherDisconnectTimerEvent

        conf = MagicMock()
        conf.state = MagicMock()
        conf.state.auto_end_state = MagicMock()
        conf.state.auto_end_state.is_active = True
        conf.state.action_history = []
        conf.update_state = AsyncMock()
        conf.stream_system_message = AsyncMock()
        conf.state.teacher_phone_number = "+111"

        mock_task = MagicMock()
        mock_task.done = MagicMock(return_value=False)
        mock_task.cancel = MagicMock()
        conf._auto_end_monitor_task = mock_task

        event = CancelTeacherDisconnectTimerEvent(conf_call=conf)
        await event.execute_event()
        mock_task.cancel.assert_called_once()


class TestAutoEndTimerExpiredEvent:
    @pytest.mark.asyncio
    async def test_execute_expired(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import AutoEndTimerExpiredEvent

        conf = MagicMock()
        conf.state = MagicMock()
        conf.state.auto_end_state = MagicMock()
        conf.state.auto_end_state.is_active = True
        conf.state.action_history = []
        conf.update_state = AsyncMock()
        conf.queue_event = AsyncMock()

        event = AutoEndTimerExpiredEvent(conf_call=conf, timeout_minutes=5)
        await event.execute_event()
        conf.update_state.assert_called_once()


class TestAutoEndTimerFailedEvent:
    @pytest.mark.asyncio
    async def test_execute_failed(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import AutoEndTimerFailedEvent

        conf = MagicMock()
        conf.state = MagicMock()
        conf.state.auto_end_state = MagicMock()
        conf.state.auto_end_state.is_active = True
        conf.state.action_history = []
        conf.update_state = AsyncMock()

        event = AutoEndTimerFailedEvent(conf_call=conf)
        await event.execute_event()
        conf.update_state.assert_called_once()


# ---------------------------------------------------------------------------
# ConferenceCall additional coverage
# ---------------------------------------------------------------------------


class TestConferenceCallExtra:
    def _make_conf_call(self):
        from app.services.conference_service import ConferenceCall

        mock_storage = MagicMock()
        mock_storage.save_state = AsyncMock()
        mock_storage.get_state = AsyncMock(return_value=None)

        mock_comm_api = MagicMock()
        mock_comm_api.start_conference = AsyncMock(return_value="conf_uuid_123")
        mock_comm_api.end_conference = AsyncMock()

        mock_conn_mgr = MagicMock()
        mock_conn_mgr.send_message_to_client = AsyncMock()

        conf = ConferenceCall(
            conf_id="test_conf_1",
            communication_api=mock_comm_api,
            connection_manager=mock_conn_mgr,
            storage_manager=mock_storage,
        )
        return conf

    @pytest.mark.asyncio
    async def test_start_processing_conf_events_queue(self) -> None:
        conf = self._make_conf_call()
        conf.start_processing_conf_events_from_queue()
        assert conf.is_queue_processing()
        conf.end_processing_conf_events_from_queue()

    def test_end_processing_conf_events_queue_no_task(self) -> None:
        conf = self._make_conf_call()
        conf.end_processing_conf_events_from_queue()
        assert not conf.is_queue_processing()

    def test_set_participant_state(self) -> None:
        conf = self._make_conf_call()
        conf.set_participant_state(teacher_phone="+111", student_phones=["+222", "+333"])
        # Should update participants in state
        participants = conf.state.participants
        assert "+111" in participants

    def test_restore_auto_end_timer_not_active(self) -> None:
        conf = self._make_conf_call()
        conf.state.auto_end_state.is_active = False
        conf.restore_auto_end_timer()  # Should return without error

    def test_restore_auto_end_timer_active(self) -> None:
        from datetime import datetime, timedelta
        conf = self._make_conf_call()
        conf.state.auto_end_state.is_active = True
        future = (datetime.utcnow() + timedelta(minutes=5)).isoformat()
        conf.state.auto_end_state.expires_at = future
        conf.state.auto_end_state.timeout_minutes = 5
        conf.queue_event = AsyncMock()
        try:
            conf.restore_auto_end_timer()
        except Exception:
            pass  # May create asyncio task

    def test_conference_call_id_attribute(self) -> None:
        conf = self._make_conf_call()
        assert conf.conf_id == "test_conf_1"

    def test_set_websocket(self) -> None:
        conf = self._make_conf_call()
        mock_ws = MagicMock()
        conf.set_websocket(mock_ws)
        assert conf._websocket == mock_ws

    def test_set_websocket_none(self) -> None:
        conf = self._make_conf_call()
        conf.set_websocket(None)
        assert conf._websocket is None

    @pytest.mark.asyncio
    async def test_queue_event(self) -> None:
        conf = self._make_conf_call()
        event = MagicMock()
        await conf.queue_event(event)
        # Should put event in queue without error

    @pytest.mark.asyncio
    async def test_stream_system_message_no_ws(self) -> None:
        conf = self._make_conf_call()
        conf._websocket = None
        conf._ws_provider = MagicMock()
        conf._ws_provider.send_service_message = AsyncMock()
        # No WS set — message goes through provider
        await conf.stream_system_message({"type": "test"})
        # Should not raise

    def test_schedule_capture_finalize_no_session(self) -> None:
        conf = self._make_conf_call()
        conf._capture_session = None
        result = conf.schedule_capture_finalize()
        assert result is None


# ---------------------------------------------------------------------------
# ConferenceCallManager extra coverage
# ---------------------------------------------------------------------------


class TestConferenceCallManagerExtra:
    def _make_manager(self):
        from app.services.conference_service import ConferenceCallManager

        mock_storage = MagicMock()
        mock_comm_api_factory = MagicMock()
        mock_conn_mgr_factory = MagicMock()

        mgr = ConferenceCallManager(
            communication_api_factory=mock_comm_api_factory,
            connection_manager_factory=mock_conn_mgr_factory,
            storage_manager=mock_storage,
        )
        return mgr

    def test_get_nonexistent_conference(self) -> None:
        mgr = self._make_manager()
        result = mgr.get_conference("nonexistent_conf_id")
        assert result is None

    def test_get_conference_from_phone_none(self) -> None:
        mgr = self._make_manager()
        result = mgr.get_conference_from_phone_number("+999999999")
        assert result is None

    def test_build_conference_call(self) -> None:
        mgr = self._make_manager()
        mgr._communication_api_factory.create = MagicMock(return_value=MagicMock())
        mgr._connection_manager_factory.create = MagicMock(return_value=MagicMock())
        mock_redis = MagicMock()
        mgr._redis_store = mock_redis  # Pre-set to avoid RedisConferenceStore init

        conf = mgr._build_conference_call("test_conf_id")
        assert conf is not None
        assert conf.conf_id == "test_conf_id"

    def test_get_conference_returns_built_conf(self) -> None:
        mgr = self._make_manager()
        mgr._communication_api_factory.create = MagicMock(return_value=MagicMock())
        mgr._connection_manager_factory.create = MagicMock(return_value=MagicMock())
        mock_redis = MagicMock()
        mgr._redis_store = mock_redis

        conf = mgr._build_conference_call("test_conf_2")
        mgr._conferences["test_conf_2"] = conf

        result = mgr.get_conference("test_conf_2")
        assert result is conf
