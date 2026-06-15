import pytest
import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/../")

from app.services.communication_api.vonage_api import VonageAPI, VonageParticipantInfo


class DummyVonage(VonageAPI):
    def __init__(self):
        self.client = MagicMock()
        self.ws_server_url = "ws://localhost:8000"
        self.conf_id = "test-conf"
        self.participant_info_map = {}
        self.vonage_conv_id = None
        self.is_websocket_connected = False


@pytest.mark.asyncio
async def test_try_connecting_websocket_success():
    api = DummyVonage()
    participant = VonageParticipantInfo(
        phone_number="+1234567890",
        call_leg_id="call-uuid-123",
        initial_conv_id="initial-conv-uuid",
    )

    api.client.voice.get_call.return_value = {"status": "answered"}
    api.client.voice.update_call.return_value = {}

    with patch(
        "app.services.communication_api.vonage_api._VONAGE_CALL_TIMEOUT_SECONDS",
        1.0,
    ), patch(
        "asyncio.sleep", return_value=None
    ):  # skip the 2s sleep in the code

        result = await api._try_connecting_websocket_with_participant(
            participant
        )

        assert result is True
        api.client.voice.get_call.assert_called_once_with(uuid="call-uuid-123")
        api.client.voice.update_call.assert_called_once()


@pytest.mark.asyncio
async def test_try_connecting_websocket_not_answered():
    api = DummyVonage()
    participant = VonageParticipantInfo(
        phone_number="+1234567890",
        call_leg_id="call-uuid-123",
        initial_conv_id="initial-conv-uuid",
    )

    api.client.voice.get_call.return_value = {"status": "ringing"}

    with patch(
        "app.services.communication_api.vonage_api._VONAGE_CALL_TIMEOUT_SECONDS",
        1.0,
    ):
        result = await api._try_connecting_websocket_with_participant(
            participant
        )

        assert result is False
        api.client.voice.get_call.assert_called_once_with(uuid="call-uuid-123")
        api.client.voice.update_call.assert_not_called()


@pytest.mark.asyncio
async def test_try_connecting_websocket_get_call_timeout():
    api = DummyVonage()
    participant = VonageParticipantInfo(
        phone_number="+1234567890",
        call_leg_id="call-uuid-123",
        initial_conv_id="initial-conv-uuid",
    )

    # Slow function to simulate a hung synchronous network request
    def slow_get_call(uuid):
        time.sleep(2.0)
        return {"status": "answered"}

    api.client.voice.get_call.side_effect = slow_get_call

    with patch(
        "app.services.communication_api.vonage_api._VONAGE_CALL_TIMEOUT_SECONDS",
        0.1,
    ):
        result = await api._try_connecting_websocket_with_participant(
            participant
        )

        assert result is False
        api.client.voice.update_call.assert_not_called()


@pytest.mark.asyncio
async def test_try_connecting_websocket_get_call_sdk_error():
    api = DummyVonage()
    participant = VonageParticipantInfo(
        phone_number="+1234567890",
        call_leg_id="call-uuid-123",
        initial_conv_id="initial-conv-uuid",
    )

    api.client.voice.get_call.side_effect = Exception("Vonage API Error")

    with patch(
        "app.services.communication_api.vonage_api._VONAGE_CALL_TIMEOUT_SECONDS",
        1.0,
    ):
        result = await api._try_connecting_websocket_with_participant(
            participant
        )

        assert result is False
        api.client.voice.update_call.assert_not_called()


@pytest.mark.asyncio
async def test_try_connecting_websocket_update_call_timeout():
    api = DummyVonage()
    participant = VonageParticipantInfo(
        phone_number="+1234567890",
        call_leg_id="call-uuid-123",
        initial_conv_id="initial-conv-uuid",
    )

    api.client.voice.get_call.return_value = {"status": "answered"}

    def slow_update_call(uuid, params):
        time.sleep(2.0)
        return {}

    api.client.voice.update_call.side_effect = slow_update_call

    with patch(
        "app.services.communication_api.vonage_api._VONAGE_CALL_TIMEOUT_SECONDS",
        0.1,
    ):

        result = await api._try_connecting_websocket_with_participant(
            participant
        )

        assert result is False


@pytest.mark.asyncio
async def test_try_connecting_websocket_update_call_sdk_error():
    api = DummyVonage()
    participant = VonageParticipantInfo(
        phone_number="+1234567890",
        call_leg_id="call-uuid-123",
        initial_conv_id="initial-conv-uuid",
    )

    api.client.voice.get_call.return_value = {"status": "answered"}
    api.client.voice.update_call.side_effect = Exception(
        "Vonage Update API Error"
    )

    with patch(
        "app.services.communication_api.vonage_api._VONAGE_CALL_TIMEOUT_SECONDS",
        1.0,
    ):

        result = await api._try_connecting_websocket_with_participant(
            participant
        )

        assert result is False


def _participant_info(phone="+1234567890", leg="call-uuid-123"):
    return VonageParticipantInfo(
        phone_number=phone,
        call_leg_id=leg,
        initial_conv_id="initial-conv-uuid",
    )


def _api_with_redis(participant_info):
    api = DummyVonage()
    api.redis_store = AsyncMock()
    api.redis_store.get_participant.return_value = participant_info
    return api


@pytest.mark.asyncio
async def test_mute_participant_timeout_raises():
    api = _api_with_redis(_participant_info())

    def slow_update_call(uuid, action):
        time.sleep(2.0)
        return {}

    api.client.voice.update_call.side_effect = slow_update_call

    with patch(
        "app.services.communication_api.vonage_api._VONAGE_CALL_TIMEOUT_SECONDS",
        0.1,
    ):
        with pytest.raises(asyncio.TimeoutError):
            await api.mute_participant("+1234567890")


@pytest.mark.asyncio
async def test_unmute_participant_sdk_error_raises():
    api = _api_with_redis(_participant_info())
    api.client.voice.update_call.side_effect = Exception(
        "400 Bad Request: call leg already ended"
    )

    with patch(
        "app.services.communication_api.vonage_api._VONAGE_CALL_TIMEOUT_SECONDS",
        1.0,
    ):
        with pytest.raises(Exception, match="400"):
            await api.unmute_participant("+1234567890")


@pytest.mark.asyncio
async def test_mute_participant_missing_leg_raises():
    api = _api_with_redis(None)

    with pytest.raises(ValueError, match="No Vonage call leg"):
        await api.mute_participant("+1234567890")
    api.client.voice.update_call.assert_not_called()


@pytest.mark.asyncio
async def test_remove_participant_timeout_keeps_redis_entry():
    api = _api_with_redis(_participant_info())

    def slow_update_call(uuid, action):
        time.sleep(2.0)
        return {}

    api.client.voice.update_call.side_effect = slow_update_call

    with patch(
        "app.services.communication_api.vonage_api._VONAGE_CALL_TIMEOUT_SECONDS",
        0.1,
    ):
        with pytest.raises(asyncio.TimeoutError):
            await api.remove_participant("+1234567890")

    api.redis_store.delete_participant.assert_not_called()


@pytest.mark.asyncio
async def test_remove_participant_missing_leg_treated_as_removed():
    api = _api_with_redis(None)

    await api.remove_participant("+1234567890")

    api.client.voice.update_call.assert_not_called()
    api.redis_store.delete_participant.assert_not_called()


@pytest.mark.asyncio
async def test_end_conf_continues_past_hung_leg():
    api = DummyVonage()
    hung = _participant_info(phone="+1111111111", leg="leg-hung")
    healthy = _participant_info(phone="+2222222222", leg="leg-healthy")
    api.redis_store = AsyncMock()
    api.redis_store.get_all_participants.return_value = {
        hung.phone_number: hung,
        healthy.phone_number: healthy,
    }

    def get_call(uuid):
        if uuid == "leg-hung":
            time.sleep(2.0)
        return {"status": "answered"}

    api.client.voice.get_call.side_effect = get_call
    api.client.voice.update_call.return_value = {}

    with patch(
        "app.services.communication_api.vonage_api._VONAGE_CALL_TIMEOUT_SECONDS",
        0.1,
    ):
        await api.end_conf()

    # The hung leg timed out, but the healthy leg was still hung up.
    api.client.voice.update_call.assert_called_once_with(
        uuid="leg-healthy", action="hangup"
    )


def test_install_session_timeout_mounts_adapter():
    """Root-cause fix: the SDK's bare requests.Session gets a real socket
    timeout so a stuck Vonage call fails fast instead of hanging the worker
    thread for 15+ minutes."""
    import requests
    from app.services.communication_api.vonage_api import (
        _install_session_timeout,
        _TimeoutHTTPAdapter,
        _VONAGE_CALL_TIMEOUT_SECONDS,
        _VONAGE_CONNECT_TIMEOUT_SECONDS,
    )

    client = MagicMock()
    client.session = requests.Session()

    _install_session_timeout(client)

    https_adapter = client.session.get_adapter("https://example.com")
    assert isinstance(https_adapter, _TimeoutHTTPAdapter)
    assert https_adapter._timeout == (
        _VONAGE_CONNECT_TIMEOUT_SECONDS,
        _VONAGE_CALL_TIMEOUT_SECONDS,
    )


def test_timeout_adapter_injects_default_timeout(monkeypatch):
    from app.services.communication_api.vonage_api import _TimeoutHTTPAdapter

    adapter = _TimeoutHTTPAdapter(timeout=(3, 7))
    captured = {}

    def fake_send(self, request, **kwargs):
        captured["timeout"] = kwargs.get("timeout")
        return "ok"

    monkeypatch.setattr(
        "requests.adapters.HTTPAdapter.send", fake_send, raising=True
    )

    # No explicit timeout -> adapter injects its default.
    adapter.send(MagicMock())
    assert captured["timeout"] == (3, 7)

    # Explicit timeout wins.
    adapter.send(MagicMock(), timeout=1.5)
    assert captured["timeout"] == 1.5


def test_install_session_timeout_no_session_is_safe():
    """If the SDK ever drops .session, install is best-effort (the wait_for
    backstop still bounds the call) and must not raise."""
    from app.services.communication_api.vonage_api import _install_session_timeout

    client = MagicMock(spec=[])  # no .session attribute
    _install_session_timeout(client)  # should not raise


def test_positive_float_or_default_valid():
    """A valid positive value passes through, coerced to float."""
    from app.services.communication_api.vonage_api import _positive_float_or_default

    assert _positive_float_or_default(30, 99.0, "X") == 30.0
    assert _positive_float_or_default("12.5", 99.0, "X") == 12.5


@pytest.mark.parametrize("bad", [None, 0, -5, "abc", ""])
def test_positive_float_or_default_falls_back(bad):
    """None / non-positive / non-numeric values fall back to the safe default,
    so the (connect, read) socket timeout can never be silently disabled."""
    from app.services.communication_api.vonage_api import _positive_float_or_default

    assert _positive_float_or_default(bad, 30.0, "X") == 30.0
