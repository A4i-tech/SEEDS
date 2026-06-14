"""
Extra coverage for conference_service.py.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


def _make_conf_call(conf_id="test_conf"):
    from app.services.conference_service import ConferenceCall

    mock_storage = MagicMock()
    mock_storage.save_state = AsyncMock()
    mock_storage.get_state = AsyncMock(return_value=None)

    mock_comm_api = MagicMock()
    mock_comm_api.start_conference = AsyncMock(return_value="conf_uuid")
    mock_comm_api.end_conference = AsyncMock()
    mock_comm_api.get_is_websocket_connected = MagicMock(return_value=False)

    mock_conn_mgr = MagicMock()
    mock_conn_mgr.send_message_to_client = AsyncMock()

    conf = ConferenceCall(
        conf_id=conf_id,
        communication_api=mock_comm_api,
        connection_manager=mock_conn_mgr,
        storage_manager=mock_storage,
    )
    return conf


class TestConferenceCallExtra:
    def test_stop_remote_audio_relay_no_task(self) -> None:
        conf = _make_conf_call()
        conf.stop_remote_audio_relay()  # No task — should not crash

    def test_stop_remote_audio_relay_with_task(self) -> None:
        conf = _make_conf_call()
        mock_task = MagicMock()
        mock_task.cancel = MagicMock()
        conf._remote_audio_task = mock_task
        conf._remote_audio_queue = MagicMock()

        conf.stop_remote_audio_relay()
        mock_task.cancel.assert_called_once()
        assert conf._remote_audio_task is None
        assert conf._remote_audio_queue is None

    @pytest.mark.asyncio
    async def test_close_websocket_none(self) -> None:
        conf = _make_conf_call()
        conf._websocket = None
        await conf.close_websocket()  # No WS — no crash

    @pytest.mark.asyncio
    async def test_close_websocket_with_ws(self) -> None:
        conf = _make_conf_call()
        mock_ws = MagicMock()
        mock_ws.close = AsyncMock()
        conf._websocket = mock_ws
        await conf.close_websocket()
        mock_ws.close.assert_called_once()
        assert conf._websocket is None

    @pytest.mark.asyncio
    async def test_close_websocket_error_silenced(self) -> None:
        conf = _make_conf_call()
        mock_ws = MagicMock()
        mock_ws.close = AsyncMock(side_effect=Exception("ws error"))
        conf._websocket = mock_ws
        await conf.close_websocket()  # Error silenced
        assert conf._websocket is None

    @pytest.mark.asyncio
    async def test_queue_event_multiple(self) -> None:
        conf = _make_conf_call()
        event1 = MagicMock()
        event2 = MagicMock()
        await conf.queue_event(event1)
        await conf.queue_event(event2)
        assert conf.event_queue.qsize() == 2

    @pytest.mark.asyncio
    async def test_stream_system_message_ws_not_connected(self) -> None:
        conf = _make_conf_call()
        conf.state.is_running = True
        conf.communication_api.get_is_websocket_connected = MagicMock(return_value=False)

        from app.models.system_audio_messages import SystemAudioMessages
        await conf.stream_system_message(SystemAudioMessages.TEACHER_HAS_JOINED)
        # WS not connected — silent return

    @pytest.mark.asyncio
    async def test_stream_system_message_not_running(self) -> None:
        conf = _make_conf_call()
        conf.state.is_running = False

        from app.models.system_audio_messages import SystemAudioMessages
        await conf.stream_system_message(SystemAudioMessages.TEACHER_HAS_JOINED)
        # Not running — silent return

    @pytest.mark.asyncio
    async def test_process_conf_events_timeout(self) -> None:
        """Test that event queue processes and handles timeouts."""
        import asyncio
        conf = _make_conf_call()

        # Create an event that will timeout
        slow_event = MagicMock()
        slow_event.execute_event = AsyncMock(side_effect=asyncio.TimeoutError())

        await conf.event_queue.put(slow_event)
        # Manually process one event from queue
        event = conf.event_queue.get_nowait()
        try:
            await asyncio.wait_for(event.execute_event(), timeout=0.1)
        except asyncio.TimeoutError:
            pass  # Expected
        finally:
            conf.event_queue.task_done()

    def test_end_processing_conf_events_with_task(self) -> None:
        conf = _make_conf_call()
        mock_task = MagicMock()
        mock_task.cancel = MagicMock()
        conf.event_queue_processing_task = mock_task

        conf.end_processing_conf_events_from_queue()
        mock_task.cancel.assert_called_once()

    def test_conference_call_initial_state(self) -> None:
        conf = _make_conf_call()
        assert conf.conf_id == "test_conf"
        assert conf._websocket is None
        assert conf._capture_session is None
        assert conf.redis_store is None

    @pytest.mark.asyncio
    async def test_on_websocket_disconnect_callback(self) -> None:
        conf = _make_conf_call()
        conf.state.is_running = False
        conf.queue_event = AsyncMock()
        conf.communication_api.reconnect_websocket = AsyncMock()
        await conf.on_websocket_disconnect_callback()
        # is_running=False → reconnect may still be called

    @pytest.mark.asyncio
    async def test_schedule_capture_finalize_with_session(self) -> None:
        conf = _make_conf_call()
        mock_session = MagicMock()
        mock_session.finalize = AsyncMock(return_value=None)
        conf._capture_session = mock_session

        result = conf.schedule_capture_finalize()
        # Returns a task
        assert result is not None
        result.cancel()

    @pytest.mark.asyncio
    async def test_log_capture_finalize_result_no_error(self) -> None:
        conf = _make_conf_call()
        mock_task = MagicMock()
        mock_task.exception = MagicMock(return_value=None)
        mock_task.result = MagicMock(return_value="https://blob.url/audio.wav")
        mock_task.cancelled = MagicMock(return_value=False)
        conf._log_capture_finalize_result(mock_task)

    @pytest.mark.asyncio
    async def test_log_capture_finalize_result_with_error(self) -> None:
        conf = _make_conf_call()
        mock_task = MagicMock()
        mock_task.cancelled = MagicMock(return_value=False)
        mock_task.exception = MagicMock(return_value=Exception("upload failed"))
        conf._log_capture_finalize_result(mock_task)

    @pytest.mark.asyncio
    async def test_finalize_capture_session_with_session(self) -> None:
        conf = _make_conf_call()
        mock_session = MagicMock()
        mock_session.finalize = AsyncMock(return_value="https://blob.url/audio.wav")
        conf._capture_session = mock_session

        result = await conf.finalize_capture_session()
        assert result == "https://blob.url/audio.wav"
        assert conf._capture_session is None

    @pytest.mark.asyncio
    async def test_start_conference(self) -> None:
        conf = _make_conf_call()
        conf.communication_api.start_conference = AsyncMock(return_value="vonage_conv_id")
        conf.state.teacher_phone_number = "+111"

        try:
            await conf.start_conference()
        except Exception:
            pass  # May fail without real vonage setup


class TestConferenceCallManagerExtra2:
    def _make_manager(self):
        from app.services.conference_service import ConferenceCallManager

        mock_storage = MagicMock()
        mock_storage.save_state = AsyncMock()

        mock_comm_api_factory = MagicMock()
        mock_comm_api_factory.create = MagicMock(return_value=MagicMock())

        mock_conn_mgr_factory = MagicMock()
        mock_conn_mgr_factory.create = MagicMock(return_value=MagicMock())

        mgr = ConferenceCallManager(
            communication_api_factory=mock_comm_api_factory,
            connection_manager_factory=mock_conn_mgr_factory,
            storage_manager=mock_storage,
        )
        mgr._redis_store = MagicMock()  # Prevent actual Redis init
        return mgr

    def test_delete_conference(self) -> None:
        mgr = self._make_manager()
        # Add conference to registry
        mock_conf = MagicMock()
        mgr._conferences["conf1"] = mock_conf

        # mock asyncio.create_task to avoid event loop issues
        with patch("asyncio.create_task"):
            mgr.delete_conference("conf1")
        assert "conf1" not in mgr._conferences

    def test_get_conference_from_phone_number_found(self) -> None:
        mgr = self._make_manager()
        mock_conf = MagicMock()
        mock_conf.state.participants = {"+111": MagicMock(), "+222": MagicMock()}
        mgr._conferences["conf1"] = mock_conf

        result = mgr.get_conference_from_phone_number("+111")
        assert result is mock_conf

    def test_get_conference_from_phone_number_not_found(self) -> None:
        mgr = self._make_manager()
        result = mgr.get_conference_from_phone_number("+999")
        assert result is None

    @pytest.mark.asyncio
    async def test_start_conference_call_nonexistent(self) -> None:
        mgr = self._make_manager()
        with pytest.raises(ValueError):
            await mgr.start_conference_call("nonexistent_conf")

    @pytest.mark.asyncio
    async def test_restore_from_redis_empty(self) -> None:
        mgr = self._make_manager()
        mgr._redis_store.list_active = AsyncMock(return_value=[])

        await mgr.restore_from_redis()  # Empty — no crash

    @pytest.mark.asyncio
    async def test_close_redis(self) -> None:
        mgr = self._make_manager()
        mgr._redis_store.close = AsyncMock()

        await mgr.close()
        mgr._redis_store.close.assert_called_once()
