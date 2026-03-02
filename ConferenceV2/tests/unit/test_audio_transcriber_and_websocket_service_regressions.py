import asyncio
import os
import sys
from unittest.mock import AsyncMock, Mock, patch

import pytest

os.environ["STORAGE_ACCOUNT_NAME"] = "test"
os.environ["ENVIRONMENT"] = "development"
os.environ["APPLICATIONINSIGHTS_CONNECTION_STRING"] = (
    "InstrumentationKey=test-key;IngestionEndpoint=https://test.com/"
)

sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/../../")

from app.services.audio.transcriber import AudioTranscriber
from app.services.singletons.websocket_service import WebsocketService


@pytest.mark.asyncio
async def test_process_chunk_merges_multiple_transcriptions_from_single_payload():
    transcriber = AudioTranscriber()
    transcriber.frame_bytes = 2

    emitted = [
        {"text": "first phrase", "duration": 0.8, "segments": [{"text": "first phrase"}]},
        {"text": "second phrase", "duration": 0.6, "segments": [{"text": "second phrase"}]},
        None,
        None,
    ]

    async def fake_consume_frame(_frame: bytes):
        return emitted.pop(0)

    transcriber._consume_frame = fake_consume_frame  # type: ignore[method-assign]

    result = await transcriber.process_chunk(b"abcdefgh")

    assert result is not None
    assert result["text"] == "first phrase second phrase"
    assert result["duration"] == pytest.approx(1.4)
    assert len(result["segments"]) == 2


@pytest.mark.asyncio
async def test_websocket_initialize_connects_before_starting_background_tasks():
    WebsocketService._instance = None
    ws_service = WebsocketService()
    call_order: list[str] = []

    connect_mock = AsyncMock(side_effect=lambda: call_order.append("connect"))
    start_mock = Mock(side_effect=lambda: call_order.append("start"))

    with patch.object(ws_service, "_connect", new=connect_mock), patch.object(
        ws_service, "_start_bg_processes", new=start_mock
    ):
        await ws_service.initialize()

    connect_mock.assert_awaited_once()
    start_mock.assert_called_once()
    assert call_order == ["connect", "start"]


@pytest.mark.asyncio
async def test_websocket_connect_is_serialized_to_single_socket_creation():
    WebsocketService._instance = None
    ws_service = WebsocketService()
    ws_service.connection_url = "ws://localhost:3000?id=test"
    ws_service.is_connected = False
    ws_service.reconnect_attempts = 0
    ws_service._ws = None
    ws_service._connect_lock = asyncio.Lock()

    async def fake_connect(_url: str):
        await asyncio.sleep(0.01)
        return object()

    with patch(
        "app.services.singletons.websocket_service.websockets.connect",
        new=AsyncMock(side_effect=fake_connect),
    ) as mock_connect:
        await asyncio.gather(ws_service._connect(), ws_service._connect())

    assert mock_connect.await_count == 1
    assert ws_service.is_connected is True
    assert ws_service._ws is not None
