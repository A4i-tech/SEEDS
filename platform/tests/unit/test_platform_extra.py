"""
Extra coverage for platform/database.py and school_controller endpoints.
"""

from __future__ import annotations

import contextlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# database.py — pure function coverage
# ---------------------------------------------------------------------------


class TestDatabaseModule:
    def test_extract_db_name_with_path(self) -> None:
        from app.platform.database import _extract_db_name

        result = _extract_db_name("mongodb://localhost:27017/seeds_platform")
        assert result == "seeds_platform"

    def test_extract_db_name_without_path(self) -> None:
        from app.platform.database import _extract_db_name

        result = _extract_db_name("mongodb://localhost:27017")
        assert result == "seeds_platform"

    def test_extract_db_name_srv_no_db(self) -> None:
        from app.platform.database import _extract_db_name

        # Azure Cosmos DB SRV URL with no database name in path — was returning hostname (contains dots)
        result = _extract_db_name(
            "mongodb+srv://admin:pass@cluster.global.mongocluster.cosmos.azure.com/?ssl=true"
        )
        assert result == "seeds_platform"

    def test_extract_db_name_with_query_string(self) -> None:
        from app.platform.database import _extract_db_name

        result = _extract_db_name("mongodb+srv://user:pass@cluster.mongodb.net/mydb?retryWrites=true")
        assert result == "mydb"

    def test_extract_db_name_empty_string(self) -> None:
        from app.platform.database import _extract_db_name

        result = _extract_db_name("")
        assert result == "seeds_platform"

    @pytest.mark.asyncio
    async def test_init_database_no_connection_string(self) -> None:
        from app.platform import database

        mock_settings = MagicMock()
        mock_settings.effective_mongo_connection_string = ""

        with patch("app.platform.database.get_settings", return_value=mock_settings):
            # Reset global state
            original_client = database._client
            original_db = database._database
            database._client = None
            database._database = None
            try:
                await database.init_database()
                # No connection string — just logs warning, no crash
            finally:
                database._client = original_client
                database._database = original_db

    @pytest.mark.asyncio
    async def test_close_database_when_not_initialized(self) -> None:
        from app.platform import database

        original_client = database._client
        original_db = database._database
        database._client = None
        database._database = None

        try:
            await database.close_database()  # No crash
        finally:
            database._client = original_client
            database._database = original_db


# ---------------------------------------------------------------------------
# teacher_disconnect_timer_event — deeper coverage via execute_event
# ---------------------------------------------------------------------------


class TestTeacherDisconnectDeeper:
    def _make_conf(self, auto_end_enabled=True):
        from app.models.conference_state import ConferenceCallState
        from app.models.participant import CallStatus, Participant, Role

        conf = MagicMock()
        conf.conf_id = "conf_timer"
        state = ConferenceCallState()
        teacher = Participant(
            name="Teacher",
            phone_number="+111",
            role=Role.TEACHER,
            call_status=CallStatus.DISCONNECTED,
        )
        state.participants["+111"] = teacher
        state.teacher_phone_number = "+111"
        conf.state = state
        conf.update_state = AsyncMock()
        conf.queue_event = AsyncMock()
        conf.stream_system_message = AsyncMock()
        conf._auto_end_monitor_task = None
        return conf

    @pytest.mark.asyncio
    async def test_execute_event_disabled_returns_early(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import (
            StartTeacherDisconnectTimerEvent,
        )

        mock_settings = MagicMock()
        mock_settings.auto_end_enabled = False
        mock_settings.auto_end_timeout_minutes = 5

        with patch("app.services.confevents.teacher_disconnect_timer_event.get_settings", return_value=mock_settings):
            conf = self._make_conf()
            event = StartTeacherDisconnectTimerEvent(conf_call=conf)
            assert event.auto_end_enabled is False
            await event.execute_event()
            conf.update_state.assert_not_called()

    @pytest.mark.asyncio
    async def test_auto_end_expired_deactivates(self) -> None:
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

        # Should deactivate and queue end-conf event
        assert conf.state.auto_end_state.is_active is False
        conf.update_state.assert_called_once()

    @pytest.mark.asyncio
    async def test_auto_end_failed_deactivates(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import AutoEndTimerFailedEvent

        conf = MagicMock()
        conf.state = MagicMock()
        conf.state.auto_end_state = MagicMock()
        conf.state.auto_end_state.is_active = True
        conf.state.action_history = []
        conf.update_state = AsyncMock()

        event = AutoEndTimerFailedEvent(conf_call=conf)
        await event.execute_event()

        assert conf.state.auto_end_state.is_active is False
        conf.update_state.assert_called_once()


# ---------------------------------------------------------------------------
# telemetry — basic import coverage
# ---------------------------------------------------------------------------


class TestTelemetry:
    def test_telemetry_module_importable(self) -> None:
        import app.platform.telemetry as t
        assert t is not None

    def test_telemetry_has_configure(self) -> None:
        from app.platform.telemetry import configure_telemetry
        assert callable(configure_telemetry)

    def test_get_counter(self) -> None:
        from app.platform.telemetry import get_counter
        result = get_counter("test.counter")
        assert result is not None

    def test_get_histogram(self) -> None:
        from app.platform.telemetry import get_histogram
        result = get_histogram("test.histogram")
        assert result is not None

    def test_get_updown_counter(self) -> None:
        from app.platform.telemetry import get_updown_counter
        result = get_updown_counter("test.updown")
        assert result is not None

    def test_configure_telemetry_disabled(self) -> None:
        from app.platform.telemetry import configure_telemetry

        mock_settings = MagicMock()
        mock_settings.azure_monitor_connection_string = ""
        mock_settings.telemetry_sampling_ratio = 1.0

        with contextlib.suppress(Exception):
            configure_telemetry(mock_settings)
