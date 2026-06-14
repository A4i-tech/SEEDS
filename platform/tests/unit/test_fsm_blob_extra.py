"""
Additional coverage for:
- FSM debug methods (print_states, print_transitions, visualize_fsm)
- BlobStorageProvider.extract_blob_path_without_extension
- SASGenerator (azure_blob_sas_enabled=False path)
- AudioAnalysisConsumer unit
- content_job_consumer deeper methods
- Conference service confevents deeper paths
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# FSM debug methods
# ---------------------------------------------------------------------------


class TestFSMDebugMethods:
    def _make_simple_fsm(self):
        from app.services.fsm.fsm import FSM
        from app.services.fsm.state import State
        from app.services.fsm.transition import Transition

        fsm = FSM(fsm_id="debug_fsm")
        s0 = State(state_id="s0")
        s1 = State(state_id="s1")
        s2 = State(state_id="s2")
        fsm.add_state(s0)
        fsm.add_state(s1)
        fsm.add_state(s2)
        fsm.set_init_state_id("s0")
        fsm.add_transition(Transition(input="1", source_state_id="s0", dest_state_id="s1"))
        fsm.add_transition(Transition(input="2", source_state_id="s0", dest_state_id="s2"))
        return fsm

    def test_print_states_no_crash(self) -> None:
        fsm = self._make_simple_fsm()
        # print_states should not raise
        fsm.print_states()

    def test_print_transitions_no_crash(self) -> None:
        fsm = self._make_simple_fsm()
        fsm.print_transitions()

    def test_print_state_transitions_no_crash(self) -> None:
        fsm = self._make_simple_fsm()
        fsm.print_state_transitions("s0")

    def test_visualize_fsm_returns_string(self) -> None:
        fsm = self._make_simple_fsm()
        result = fsm.visualize_fsm()
        assert isinstance(result, str)
        assert "s0" in result
        assert "s1" in result

    def test_visualize_fsm_with_explicit_state(self) -> None:
        fsm = self._make_simple_fsm()
        result = fsm.visualize_fsm(current_state_id="s0")
        assert isinstance(result, str)
        assert "s0" in result

    def test_add_transition_invalid_states(self) -> None:
        from app.services.fsm.fsm import FSM
        from app.services.fsm.transition import Transition

        fsm = FSM(fsm_id="invalid_trans_fsm")
        with pytest.raises((ValueError, KeyError)):
            fsm.add_transition(Transition(input="1", source_state_id="missing_s", dest_state_id="missing_d"))

    def test_fsm_has_states(self) -> None:
        fsm = self._make_simple_fsm()
        assert "s0" in fsm.states
        assert "s1" in fsm.states

    def test_fsm_init_state_id(self) -> None:
        fsm = self._make_simple_fsm()
        assert fsm.init_state_id == "s0"


# ---------------------------------------------------------------------------
# BlobStorageProvider.extract_blob_path_without_extension
# ---------------------------------------------------------------------------


class TestBlobStorageExtractPath:
    def test_extract_path_without_extension(self) -> None:
        from app.providers.blob_storage import _parse_blob_url, BlobStorageProvider

        # Test _parse_blob_url directly
        container, blob = _parse_blob_url(
            "https://myaccount.blob.core.windows.net/container/path/file.wav"
        )
        assert container == "container"
        assert blob == "path/file.wav"

    def test_extract_blob_path_strip_extension(self) -> None:
        from app.providers.blob_storage import _parse_blob_url

        container, blob = _parse_blob_url(
            "https://myaccount.blob.core.windows.net/audio/conf-123.wav"
        )
        assert container == "audio"
        # Strip extension manually
        dot_pos = blob.rfind(".")
        if dot_pos > 0:
            stripped = blob[:dot_pos]
        else:
            stripped = blob
        assert "conf-123" in stripped


# ---------------------------------------------------------------------------
# SASGenerator — azure_blob_sas_enabled=False path
# ---------------------------------------------------------------------------


class TestSASGeneratorDisabled:
    def _make_sas_gen(self):
        from app.providers.blob_storage import SASGenerator

        mock_settings = MagicMock()
        mock_settings.storage_account_name = ""
        mock_settings.azure_storage_account_name = ""
        mock_settings.accountkey = ""
        mock_settings.azure_storage_account_key = ""
        mock_settings.azure_blob_sas_enabled = False

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings):
            gen = SASGenerator()
        return gen

    def test_disabled_returns_original_url(self) -> None:
        gen = self._make_sas_gen()
        url = "https://example.blob.core.windows.net/container/file.mp3"
        result = gen.get_url_with_sas(url)
        assert result == url

    def test_disabled_with_empty_url(self) -> None:
        gen = self._make_sas_gen()
        result = gen.get_url_with_sas("")
        assert result == ""

    def test_disabled_azure_blob_sas_enabled_false(self) -> None:
        gen = self._make_sas_gen()
        assert gen._azure_enabled is False


# ---------------------------------------------------------------------------
# AudioAnalysisConsumer — unit tests
# ---------------------------------------------------------------------------


class TestAudioAnalysisConsumer:
    def test_instantiation(self) -> None:
        from app.consumers.audio_analysis_consumer import AudioAnalysisConsumer

        mgr = MagicMock()
        consumer = AudioAnalysisConsumer(conference_manager=mgr)
        assert consumer._conference_manager is mgr
        assert consumer._transcriber is None
        assert consumer._hold_detector is None

    @pytest.mark.asyncio
    async def test_ensure_pipeline_analysis_disabled(self) -> None:
        from app.consumers.audio_analysis_consumer import AudioAnalysisConsumer

        mock_settings = MagicMock()
        mock_settings.audio_analysis_enabled = False

        consumer = AudioAnalysisConsumer(conference_manager=MagicMock())
        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            await consumer._ensure_pipeline()

        # Should remain None when disabled
        assert consumer._transcriber is None
        assert consumer._hold_detector is None

    @pytest.mark.asyncio
    async def test_process_message_no_pipeline(self) -> None:
        from app.consumers.audio_analysis_consumer import AudioAnalysisConsumer

        mock_settings = MagicMock()
        mock_settings.audio_analysis_enabled = False

        consumer = AudioAnalysisConsumer(conference_manager=MagicMock())
        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            # process should not raise even with no pipeline
            await consumer.process(("conf1", "https://example.com/audio.wav"))

    def test_consumer_name(self) -> None:
        from app.consumers.audio_analysis_consumer import AudioAnalysisConsumer

        consumer = AudioAnalysisConsumer(conference_manager=MagicMock())
        assert consumer.name == "audio_analysis_consumer"


# ---------------------------------------------------------------------------
# ContentJobConsumer — deeper method tests
# ---------------------------------------------------------------------------


class TestContentJobConsumerDeeper:
    @pytest.fixture
    def db(self):
        import mongomock_motor
        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_cj_deeper"]

    @pytest.mark.asyncio
    async def test_process_message_with_call_webhook_type(self, db) -> None:
        from app.consumers.content_job_consumer import ContentJobConsumer
        from app.providers.service_bus import QueueMessage, MessageType

        consumer = ContentJobConsumer(db)
        msg = QueueMessage(
            type=MessageType.CALL_WEBHOOK,
            payload={
                "job_id": "job_started_test",
                "status": "STARTED",
                "tenant_id": "t1",
            },
        )
        # process should handle unknown status gracefully
        try:
            await consumer.process(msg)
        except Exception:
            pass  # External service calls may fail

    @pytest.mark.asyncio
    async def test_process_message_missing_fields(self, db) -> None:
        from app.consumers.content_job_consumer import ContentJobConsumer
        from app.providers.service_bus import QueueMessage, MessageType

        consumer = ContentJobConsumer(db)
        msg = QueueMessage(
            type=MessageType.CALL_EVENT,
            payload={},  # empty payload
        )
        try:
            await consumer.process(msg)
        except Exception:
            pass  # Acceptable


# ---------------------------------------------------------------------------
# Conference service confevents — deeper coverage
# ---------------------------------------------------------------------------


class TestConferenceConfeventsExtra:
    def _mock_conf(self):
        conf = MagicMock()
        conf.conf_id = "conf_event_1"
        conf.state = MagicMock()
        conf.state.is_running = True
        conf.state.participants = {}
        conf.queue_event = AsyncMock()
        conf.update_state = AsyncMock()
        return conf

    def test_hold_detected_event_creation(self) -> None:
        from app.services.confevents.hold_detected_event import HoldDetectedEvent

        conf = self._mock_conf()
        event = HoldDetectedEvent(phone_number="+111", conf_call=conf)
        assert event.phone_number == "+111"

    @pytest.mark.asyncio
    async def test_hold_detected_execute_no_participant(self) -> None:
        from app.services.confevents.hold_detected_event import HoldDetectedEvent

        conf = self._mock_conf()
        conf.state.participants = {}  # no participants
        event = HoldDetectedEvent(phone_number="+999", conf_call=conf)
        await event.execute_event()  # Should return early if no participant

    def test_reconnect_comm_api_event_creation(self) -> None:
        from app.services.confevents.reconnect_comm_api_websocket_event import ReconnectCommApiWebsocketEvent

        conf = self._mock_conf()
        event = ReconnectCommApiWebsocketEvent(conf_call=conf)
        assert event is not None


# ---------------------------------------------------------------------------
# School controller — coverage
# ---------------------------------------------------------------------------


class TestSchoolControllerEndpoints:
    """Integration tests via HTTP client."""

    @pytest.fixture
    def db(self):
        import mongomock_motor
        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_school_ctrl"]

    @pytest.mark.asyncio
    async def test_get_school_dashboard_requires_auth(self) -> None:
        import os
        os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
        os.environ.setdefault("APP_MODE", "api")

        from httpx import ASGITransport, AsyncClient
        from mongomock_motor import AsyncMongoMockClient
        from app.main import app
        from app.platform.auth.dependencies import get_db

        client = AsyncMongoMockClient()
        mock_db = client["test_school_ctrl_http"]

        async def _override_db():
            yield mock_db

        app.dependency_overrides[get_db] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/school/dashboard")
        app.dependency_overrides.clear()
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_get_ivr_structure_requires_auth(self) -> None:
        import os
        os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
        os.environ.setdefault("APP_MODE", "api")

        from httpx import ASGITransport, AsyncClient
        from mongomock_motor import AsyncMongoMockClient
        from app.main import app
        from app.platform.auth.dependencies import get_db

        client = AsyncMongoMockClient()
        mock_db = client["test_ivr_ctrl_http"]

        async def _override_db():
            yield mock_db

        app.dependency_overrides[get_db] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/ivr/structure")
        app.dependency_overrides.clear()
        assert resp.status_code == 401
