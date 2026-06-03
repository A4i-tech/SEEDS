import pytest
import asyncio
import time
from unittest.mock import MagicMock, patch
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
        "app.services.communication_api.vonage_api._VONAGE_GET_CALL_TIMEOUT_SECONDS",
        1.0,
    ), patch(
        "app.services.communication_api.vonage_api._VONAGE_UPDATE_CALL_TIMEOUT_SECONDS",
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
        "app.services.communication_api.vonage_api._VONAGE_GET_CALL_TIMEOUT_SECONDS",
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
        "app.services.communication_api.vonage_api._VONAGE_GET_CALL_TIMEOUT_SECONDS",
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
        "app.services.communication_api.vonage_api._VONAGE_GET_CALL_TIMEOUT_SECONDS",
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
        "app.services.communication_api.vonage_api._VONAGE_GET_CALL_TIMEOUT_SECONDS",
        1.0,
    ), patch(
        "app.services.communication_api.vonage_api._VONAGE_UPDATE_CALL_TIMEOUT_SECONDS",
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
        "app.services.communication_api.vonage_api._VONAGE_GET_CALL_TIMEOUT_SECONDS",
        1.0,
    ), patch(
        "app.services.communication_api.vonage_api._VONAGE_UPDATE_CALL_TIMEOUT_SECONDS",
        1.0,
    ):

        result = await api._try_connecting_websocket_with_participant(
            participant
        )

        assert result is False


def test_vonage_api_host_configuration():
    from config import Settings

    custom_settings = Settings(VONAGE_API_HOST="custom-api.nexmo.com")

    with patch(
        "app.services.communication_api.vonage_api.get_settings",
        return_value=custom_settings,
    ), patch("vonage.Client") as MockClient:
        mock_client_instance = MagicMock()
        MockClient.return_value = mock_client_instance

        api = VonageAPI(
            application_id="app-id",
            private_key_path="private-key",
            vonage_number="12345",
            conf_id="conf-id",
            ws_server_url="ws://localhost:8000",
        )

        mock_client_instance.api_host.assert_called_once_with(
            "custom-api.nexmo.com"
        )

