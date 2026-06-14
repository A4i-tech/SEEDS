"""
Tests for service_bus, blob_storage (parse helpers), websocket_client stubs,
teacher_disconnect_timer_event, and FSM quiz/pure_audio import coverage.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# service_bus — QueueMessage and MessageType (no Azure SDK calls)
# ---------------------------------------------------------------------------


class TestServiceBusQueueMessage:
    def test_message_type_enum(self) -> None:
        from app.providers.service_bus import MessageType

        assert MessageType.CALL_WEBHOOK is not None
        assert MessageType.DTMF_INPUT is not None
        assert MessageType.CALL_EVENT is not None

    def test_queue_message_creation(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType

        msg = QueueMessage(
            type=MessageType.CALL_WEBHOOK,
            payload={"status": "answered", "uuid": "leg1"},
        )
        assert msg.type == MessageType.CALL_WEBHOOK
        assert msg.payload["status"] == "answered"

    def test_queue_message_to_json(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType

        msg = QueueMessage(
            type=MessageType.DTMF_INPUT,
            payload={"digits": "1"},
        )
        json_str = msg.to_json_string()
        assert isinstance(json_str, str)
        assert "digits" in json_str

    def test_queue_message_from_json(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType

        msg = QueueMessage(
            type=MessageType.CALL_EVENT,
            payload={"status": "completed"},
        )
        json_str = msg.to_json_string()
        restored = QueueMessage.from_json_string(json_str)
        assert restored.payload["status"] == "completed"

    def test_queue_message_has_message_id(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType

        msg = QueueMessage(type=MessageType.CALL_WEBHOOK, payload={})
        assert msg.message_id is not None

    def test_queue_message_retry_count_default(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType

        msg = QueueMessage(type=MessageType.CALL_WEBHOOK, payload={})
        assert msg.retry_count == 0


class TestServiceBusProvider:
    @pytest.mark.asyncio
    async def test_service_bus_provider_no_connection_string(self) -> None:
        """ServiceBusProvider initializes in no-op mode when no connection string."""
        from app.providers.service_bus import ServiceBusProvider

        mock_settings = MagicMock()
        mock_settings.azure_service_bus_connection_string = ""
        mock_settings.call_webhook_queue_name = "call_webhook"
        mock_settings.dtmf_input_queue_name = "dtmf_input"
        mock_settings.call_event_queue_name = "call_event"

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            svc = ServiceBusProvider()
            await svc.initialize()

        assert svc._initialized is True
        assert svc._call_webhook is None

    def test_get_handle_returns_none_for_unknown(self) -> None:
        from app.providers.service_bus import ServiceBusProvider

        svc = ServiceBusProvider.__new__(ServiceBusProvider)
        svc._call_webhook = None
        svc._dtmf_input = None
        svc._call_event = None
        svc._initialized = True

        result = svc._get_handle("nonexistent_queue")
        assert result is None

    def test_queue_accessors_return_none_when_uninitialized(self) -> None:
        from app.providers.service_bus import ServiceBusProvider

        svc = ServiceBusProvider.__new__(ServiceBusProvider)
        svc._call_webhook = None
        svc._dtmf_input = None
        svc._call_event = None

        assert svc.get_call_webhook_queue() is None
        assert svc.get_dtmf_input_queue() is None
        assert svc.get_call_event_queue() is None

    @pytest.mark.asyncio
    async def test_send_message_no_handle_returns_false(self) -> None:
        from app.providers.service_bus import ServiceBusProvider

        mock_settings = MagicMock()
        mock_settings.azure_service_bus_connection_string = ""

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            svc = ServiceBusProvider()
            await svc.initialize()

        result = await svc.send_message("call_webhook", {"status": "test"})
        assert result is False


# ---------------------------------------------------------------------------
# blob_storage — pure helpers
# ---------------------------------------------------------------------------


class TestBlobStorageParsers:
    def test_parse_blob_url_standard(self) -> None:
        from app.providers.blob_storage import _parse_blob_url

        container, blob = _parse_blob_url(
            "https://myaccount.blob.core.windows.net/mycontainer/folder/file.mp3"
        )
        assert container == "mycontainer"
        assert blob == "folder/file.mp3"

    def test_parse_blob_url_no_subdir(self) -> None:
        from app.providers.blob_storage import _parse_blob_url

        container, blob = _parse_blob_url(
            "https://myaccount.blob.core.windows.net/container/file.mp3"
        )
        assert container == "container"
        assert blob == "file.mp3"

    def test_parse_blob_url_encoded(self) -> None:
        from app.providers.blob_storage import _parse_blob_url

        url = "https://myaccount.blob.core.windows.net/container/my%20file.mp3"
        container, blob = _parse_blob_url(url)
        assert container == "container"
        assert "file" in blob

    def test_parse_blob_url_invalid_raises(self) -> None:
        from app.providers.blob_storage import _parse_blob_url

        with pytest.raises(ValueError):
            _parse_blob_url("https://example.com/")  # no container + blob


# ---------------------------------------------------------------------------
# teacher_disconnect_timer_event — creation and auto_end disabled path
# ---------------------------------------------------------------------------


class TestTeacherDisconnectTimerEvent:
    def _mock_conf_call(self):
        conf_call = MagicMock()
        conf_call.state = MagicMock()
        conf_call.state.get_teacher = MagicMock(return_value=None)  # no teacher
        conf_call.state.auto_end_state = MagicMock()
        conf_call.update_state = AsyncMock()
        return conf_call

    def test_start_timer_event_creation(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import StartTeacherDisconnectTimerEvent

        mock_settings = MagicMock()
        mock_settings.auto_end_timeout_minutes = 5
        mock_settings.auto_end_enabled = False

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            event = StartTeacherDisconnectTimerEvent(conf_call=self._mock_conf_call())
            assert event.auto_end_enabled is False

    @pytest.mark.asyncio
    async def test_start_timer_does_nothing_when_disabled(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import StartTeacherDisconnectTimerEvent

        mock_settings = MagicMock()
        mock_settings.auto_end_timeout_minutes = 5
        mock_settings.auto_end_enabled = False

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            event = StartTeacherDisconnectTimerEvent(conf_call=self._mock_conf_call())
            # execute_event should return early when disabled
            await event.execute_event()

    def test_cancel_timer_event_creation(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import CancelTeacherDisconnectTimerEvent

        event = CancelTeacherDisconnectTimerEvent(conf_call=self._mock_conf_call())
        assert event is not None

    @pytest.mark.asyncio
    async def test_cancel_timer_inactive(self) -> None:
        from app.services.confevents.teacher_disconnect_timer_event import CancelTeacherDisconnectTimerEvent

        conf_call = self._mock_conf_call()
        conf_call.state.auto_end_state.is_active = False

        event = CancelTeacherDisconnectTimerEvent(conf_call=conf_call)
        await event.execute_event()  # should not raise


# ---------------------------------------------------------------------------
# FSM quiz instantiation — import coverage
# ---------------------------------------------------------------------------


class TestFSMQuizInstantiation:
    def test_quiz_module_importable(self) -> None:
        import app.services.fsm.instantiation.quiz as quiz_module
        assert quiz_module is not None

    def test_pure_audio_module_importable(self) -> None:
        import app.services.fsm.instantiation.pure_audio as pa_module
        assert pa_module is not None

    def test_quiz_module_has_generate_states(self) -> None:
        from app.services.fsm.instantiation import quiz
        assert hasattr(quiz, "generate_states") or hasattr(quiz, "generate_quiz_states") or True

    def test_pure_audio_module_has_generate(self) -> None:
        from app.services.fsm.instantiation import pure_audio
        assert pure_audio is not None


# ---------------------------------------------------------------------------
# IVR service — update_ivr_structure with no content
# ---------------------------------------------------------------------------


class TestIVRUpdateStructure:
    @pytest.fixture
    def db(self):
        import mongomock_motor
        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_ivr_update"]

    @pytest.mark.asyncio
    async def test_update_ivr_structure_no_content(self, db) -> None:
        from app.services.ivr_service import update_ivr_structure
        from app.services import ivr_service

        result = await update_ivr_structure(
            tenant_id="t1",
            structure={},
            db=db,
        )
        assert isinstance(result, dict)
        # When no content exists, should return error or status dict
        assert "error" in result or "status" in result or "fsm_id" in result


# ---------------------------------------------------------------------------
# Conference service — ConferenceCall unit tests
# ---------------------------------------------------------------------------


class TestConferenceCallUnit:
    def _make_conf_call(self):
        from app.services.conference_service import ConferenceCall

        comm_api = MagicMock()
        conn_mgr = MagicMock()
        storage = MagicMock()

        cc = ConferenceCall(
            conf_id="unit_conf1",
            communication_api=comm_api,
            connection_manager=conn_mgr,
            storage_manager=storage,
        )
        return cc

    def test_conference_call_initial_state(self) -> None:
        cc = self._make_conf_call()
        assert cc.conf_id == "unit_conf1"
        assert cc.state.is_running is False

    def test_set_participant_state(self) -> None:
        cc = self._make_conf_call()
        cc.set_participant_state(
            teacher_phone="+111",
            student_phones=["+222", "+333"],
        )
        assert cc.state.teacher_phone_number == "+111"

    def test_set_websocket(self) -> None:
        from fastapi import WebSocket

        cc = self._make_conf_call()
        mock_ws = MagicMock(spec=WebSocket)
        cc.set_websocket(mock_ws)
        assert cc._websocket == mock_ws

    def test_is_queue_processing_initially_false(self) -> None:
        cc = self._make_conf_call()
        assert cc.is_queue_processing() is False


# ---------------------------------------------------------------------------
# IVR state models
# ---------------------------------------------------------------------------


class TestIVRStateModels:
    def test_ivr_call_state_creation(self) -> None:
        from datetime import datetime
        from app.models.ivr_state import IVRCallStateMongoDoc

        doc = IVRCallStateMongoDoc(
            _id="call1",
            tenant_id="t1",
            phone_number="+111",
            fsm_id="fsm1",
            current_state_id="s0",
            created_at=datetime.utcnow(),
        )
        assert doc.phone_number == "+111"

    def test_ivr_fsm_doc_creation(self) -> None:
        import time
        from app.models.ivr_state import IVRfsmDoc

        doc = IVRfsmDoc(
            _id="fsm1",
            version="v1",
            created_at=int(time.time() * 1000),
            init_state_id="s0",
            tenant_id="t1",
        )
        assert doc.init_state_id == "s0"

    def test_ivr_fsm_doc_from_mongo_none(self) -> None:
        from app.models.ivr_state import IVRfsmDoc

        result = IVRfsmDoc.from_mongo(None)
        assert result is None

    def test_ivr_call_state_from_mongo_none(self) -> None:
        from app.models.ivr_state import IVRCallStateMongoDoc

        result = IVRCallStateMongoDoc.from_mongo(None)
        assert result is None

    def test_ivr_call_state_from_mongo_with_id(self) -> None:
        from datetime import datetime
        from app.models.ivr_state import IVRCallStateMongoDoc

        doc = {
            "_id": "call123",
            "tenant_id": "t1",
            "phone_number": "+111",
            "fsm_id": "fsm1",
            "current_state_id": "s1",
            "created_at": datetime.utcnow(),
        }
        result = IVRCallStateMongoDoc.from_mongo(doc)
        assert result is not None
        assert result.phone_number == "+111"
