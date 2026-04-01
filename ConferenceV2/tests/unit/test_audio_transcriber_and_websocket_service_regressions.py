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
import websockets


@pytest.mark.asyncio
async def test_process_chunk_merges_multiple_transcriptions_from_single_payload():
    transcriber = AudioTranscriber()
    transcriber.frame_bytes = 2

    emitted = [
        {
            "text": "first phrase",
            "duration": 0.8,
            "segments": [{"text": "first phrase"}],
        },
        {
            "text": "second phrase",
            "duration": 0.6,
            "segments": [{"text": "second phrase"}],
        },
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
    assert len(result["transcript_chunks"]) == 2
    assert result["transcript_chunks"][0]["text"] == "first phrase"
    assert result["transcript_chunks"][1]["text"] == "second phrase"
