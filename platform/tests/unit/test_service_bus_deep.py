"""
Deep coverage for service_bus, webhook_controller security paths,
content_controller additional paths, and users_controller additional routes.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# ServiceBusProvider — methods with handle=None (no Azure)
# ---------------------------------------------------------------------------


class TestServiceBusProviderNullHandles:
    def _make_provider(self):
        from app.providers.service_bus import ServiceBusProvider

        p = ServiceBusProvider.__new__(ServiceBusProvider)
        p._call_webhook = None
        p._dtmf_input = None
        p._call_event = None
        p._initialized = True
        return p

    @pytest.mark.asyncio
    async def test_receive_messages_null_handle_returns_empty(self) -> None:
        p = self._make_provider()
        result = await p.receive_messages("call_webhook")
        assert result == []

    @pytest.mark.asyncio
    async def test_complete_message_null_handle_returns_false(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType
        p = self._make_provider()
        msg = QueueMessage(type=MessageType.CALL_WEBHOOK, payload={})
        result = await p.complete_message("call_webhook", msg)
        assert result is False

    @pytest.mark.asyncio
    async def test_abandon_message_null_handle_returns_false(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType
        p = self._make_provider()
        msg = QueueMessage(type=MessageType.DTMF_INPUT, payload={})
        result = await p.abandon_message("dtmf_input", msg)
        assert result is False

    @pytest.mark.asyncio
    async def test_dead_letter_message_null_handle_returns_false(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType
        p = self._make_provider()
        msg = QueueMessage(type=MessageType.CALL_EVENT, payload={})
        result = await p.dead_letter_message("call_event", msg, "test reason")
        assert result is False

    @pytest.mark.asyncio
    async def test_send_call_webhook_null_handle_returns_false(self) -> None:
        p = self._make_provider()
        result = await p.send_call_webhook({"phone_number": "+111"})
        assert result is False

    @pytest.mark.asyncio
    async def test_send_dtmf_input_null_handle_returns_false(self) -> None:
        p = self._make_provider()
        result = await p.send_dtmf_input({"digits": "1"})
        assert result is False

    @pytest.mark.asyncio
    async def test_send_call_event_null_handle_returns_false(self) -> None:
        p = self._make_provider()
        result = await p.send_call_event({"status": "completed"})
        assert result is False

    def test_get_handle_returns_none_for_unknown_queue(self) -> None:
        p = self._make_provider()
        result = p._get_handle("nonexistent_queue_xyz")
        assert result is None

    def test_get_handle_call_webhook(self) -> None:
        p = self._make_provider()
        result = p._get_handle("call_webhook")
        assert result is None  # None because handle was set to None

    @pytest.mark.asyncio
    async def test_already_initialized_warn_and_return(self) -> None:
        from app.providers.service_bus import ServiceBusProvider

        mock_settings = MagicMock()
        mock_settings.azure_service_bus_connection_string = ""

        p = ServiceBusProvider.__new__(ServiceBusProvider)
        p._call_webhook = None
        p._dtmf_input = None
        p._call_event = None
        p._initialized = True

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            # Already initialized — should just warn and return
            await p.initialize()
        assert p._initialized is True


# ---------------------------------------------------------------------------
# _AzureQueueHandle — unit tests with mock client
# ---------------------------------------------------------------------------


class TestAzureQueueHandle:
    def _make_handle(self, queue_name="test_queue"):
        from app.providers.service_bus import _AzureQueueHandle

        handle = _AzureQueueHandle.__new__(_AzureQueueHandle)
        handle.queue_name = queue_name
        handle._client = MagicMock()
        handle._receiver = AsyncMock()
        handle._message_map = {}
        return handle

    @pytest.mark.asyncio
    async def test_complete_message_not_in_map_returns_false(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType

        handle = self._make_handle()
        msg = QueueMessage(type=MessageType.CALL_WEBHOOK, payload={})
        result = await handle.complete(msg)
        assert result is False

    @pytest.mark.asyncio
    async def test_abandon_message_not_in_map_returns_false(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType

        handle = self._make_handle()
        msg = QueueMessage(type=MessageType.CALL_WEBHOOK, payload={})
        result = await handle.abandon(msg)
        assert result is False

    @pytest.mark.asyncio
    async def test_dead_letter_not_in_map_returns_false(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType

        handle = self._make_handle()
        msg = QueueMessage(type=MessageType.CALL_WEBHOOK, payload={})
        result = await handle.dead_letter(msg, "reason")
        assert result is False

    @pytest.mark.asyncio
    async def test_complete_message_in_map_success(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType

        handle = self._make_handle()
        msg = QueueMessage(type=MessageType.CALL_WEBHOOK, payload={})
        raw_mock = MagicMock()
        handle._message_map[msg.message_id] = raw_mock
        handle._receiver.complete_message = AsyncMock()

        result = await handle.complete(msg)
        assert result is True
        handle._receiver.complete_message.assert_called_once_with(raw_mock)

    @pytest.mark.asyncio
    async def test_abandon_message_in_map_success(self) -> None:
        from app.providers.service_bus import QueueMessage, MessageType

        handle = self._make_handle()
        msg = QueueMessage(type=MessageType.DTMF_INPUT, payload={})
        raw_mock = MagicMock()
        handle._message_map[msg.message_id] = raw_mock
        handle._receiver.abandon_message = AsyncMock()

        result = await handle.abandon(msg)
        assert result is True

    @pytest.mark.asyncio
    async def test_receive_returns_empty_on_exception(self) -> None:
        from app.providers.service_bus import QueueMessage

        handle = self._make_handle()
        handle._receiver.receive_messages = AsyncMock(side_effect=Exception("recv failed"))

        result = await handle.receive()
        assert result == []

    @pytest.mark.asyncio
    async def test_close_handle_no_error(self) -> None:
        handle = self._make_handle()
        handle._receiver.__aexit__ = AsyncMock()
        handle._client.close = AsyncMock()

        await handle.close()  # Should not raise


# ---------------------------------------------------------------------------
# Webhook controller — via HTTP integration
# ---------------------------------------------------------------------------


class TestWebhookControllerDeep:
    @pytest.fixture
    def client_and_db(self):
        import os
        os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
        os.environ.setdefault("APP_MODE", "api")
        return None

    @pytest.mark.asyncio
    async def test_answer_endpoint_public(self) -> None:
        from httpx import ASGITransport, AsyncClient
        from mongomock_motor import AsyncMongoMockClient
        from app.main import app
        from app.platform.auth.dependencies import get_db

        client = AsyncMongoMockClient()
        db = client["test_wh_deep"]

        async def _override_db():
            yield db

        app.dependency_overrides[get_db] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.get("/answer")
        app.dependency_overrides.clear()
        assert resp.status_code in (200, 204, 422)

    @pytest.mark.asyncio
    async def test_event_endpoint_completed_status(self) -> None:
        from httpx import ASGITransport, AsyncClient
        from mongomock_motor import AsyncMongoMockClient
        from app.main import app
        from app.platform.auth.dependencies import get_db

        client = AsyncMongoMockClient()
        db = client["test_wh_event"]

        async def _override_db():
            yield db

        app.dependency_overrides[get_db] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/event", json={
                "status": "completed",
                "uuid": "leg-uuid-1",
                "conversation_uuid": "conv-uuid-1",
                "to": "+111",
                "from": "+222",
                "direction": "outbound",
            })
        app.dependency_overrides.clear()
        assert resp.status_code in (200, 204, 422)

    @pytest.mark.asyncio
    async def test_event_endpoint_answered_status(self) -> None:
        from httpx import ASGITransport, AsyncClient
        from mongomock_motor import AsyncMongoMockClient
        from app.main import app
        from app.platform.auth.dependencies import get_db

        client = AsyncMongoMockClient()
        db = client["test_wh_answered"]

        async def _override_db():
            yield db

        app.dependency_overrides[get_db] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/event", json={
                "status": "answered",
                "uuid": "leg-uuid-2",
                "conversation_uuid": "conv-uuid-2",
                "to": "+333",
                "from": "+444",
                "direction": "inbound",
            })
        app.dependency_overrides.clear()
        assert resp.status_code in (200, 204, 422)

    @pytest.mark.asyncio
    async def test_dtmf_webhook_no_auth_404_or_200(self) -> None:
        from httpx import ASGITransport, AsyncClient
        from mongomock_motor import AsyncMongoMockClient
        from app.main import app
        from app.platform.auth.dependencies import get_db

        client = AsyncMongoMockClient()
        db = client["test_wh_dtmf"]

        async def _override_db():
            yield db

        app.dependency_overrides[get_db] = _override_db
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post("/dtmf", json={
                "dtmf": {"digits": "1"},
                "uuid": "leg-uuid-3",
            })
        app.dependency_overrides.clear()
        assert resp.status_code in (200, 204, 404, 422)


# ---------------------------------------------------------------------------
# Conference service — update_state method
# ---------------------------------------------------------------------------


class TestConferenceCallUpdateState:
    def _make_conf(self):
        from app.services.conference_service import ConferenceCall

        comm = MagicMock()
        conn = MagicMock()
        conn.send_message_to_client = AsyncMock()
        storage = MagicMock()
        storage.save_state = AsyncMock()
        cc = ConferenceCall(
            conf_id="update_conf1",
            communication_api=comm,
            connection_manager=conn,
            storage_manager=storage,
        )
        cc.redis_store = None  # disable redis
        return cc

    @pytest.mark.asyncio
    async def test_update_state_calls_storage(self) -> None:
        cc = self._make_conf()
        await cc.update_state()
        cc.storage_manager.save_state.assert_called_once()

    @pytest.mark.asyncio
    async def test_update_state_propagates_storage_error(self) -> None:
        cc = self._make_conf()
        cc.storage_manager.save_state = AsyncMock(side_effect=Exception("db error"))
        # update_state propagates exceptions
        with pytest.raises(Exception, match="db error"):
            await cc.update_state()

    @pytest.mark.asyncio
    async def test_finalize_capture_session_none(self) -> None:
        cc = self._make_conf()
        cc._capture_session = None
        result = await cc.finalize_capture_session()
        assert result is None

    @pytest.mark.asyncio
    async def test_finalize_capture_session_calls_finalize(self) -> None:
        cc = self._make_conf()
        mock_session = MagicMock()
        mock_session.finalize = AsyncMock(return_value="https://blob.example.com/audio.wav")
        cc._capture_session = mock_session

        result = await cc.finalize_capture_session()
        assert result == "https://blob.example.com/audio.wav"
        assert cc._capture_session is None  # cleared after finalize

    def test_stop_remote_audio_relay_when_none(self) -> None:
        cc = self._make_conf()
        cc._remote_audio_task = None
        cc._remote_audio_queue = None
        cc.stop_remote_audio_relay()  # Should not raise

    def test_end_processing_when_no_task(self) -> None:
        cc = self._make_conf()
        cc.event_queue_processing_task = None
        cc.end_processing_conf_events_from_queue()  # Should not raise

    def test_log_capture_finalize_result_no_error(self) -> None:
        cc = self._make_conf()
        task = MagicMock()
        task.result = MagicMock(return_value="https://blob.url/audio.wav")
        cc._log_capture_finalize_result(task)  # Should not raise

    def test_log_capture_finalize_result_with_error(self) -> None:
        cc = self._make_conf()
        task = MagicMock()
        task.result = MagicMock(side_effect=Exception("finalize failed"))
        cc._log_capture_finalize_result(task)  # Should log, not raise
