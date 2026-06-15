import asyncio
import io
import os
import sys
import threading
import wave
from unittest.mock import AsyncMock, Mock, patch

import pytest
from scipy import signal as scipy_signal

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


@pytest.mark.asyncio
async def test_transcribe_segment_sends_16k_mono_wav():
    transcriber = AudioTranscriber()

    sent = {}

    async def capture_create(*, file, **kwargs):
        file.seek(0)
        sent["bytes"] = file.read()
        sent["name"] = file.name
        result = Mock()
        result.text = "hello"
        result.duration = 1.0
        result.segments = []
        return result

    transcriber.client = Mock()
    transcriber.client.audio.transcriptions.create = capture_create

    # 100ms of 8kHz 16-bit PCM -> 800 samples in, 1600 samples out
    await transcriber._transcribe_segment(b"\x00\x01" * 800)

    assert sent["name"] == "audio.wav"
    with wave.open(io.BytesIO(sent["bytes"]), "rb") as wf:
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2
        assert wf.getframerate() == AudioTranscriber.PROCESS_RATE
        assert wf.getnframes() == 1600


@pytest.mark.asyncio
async def test_transcribe_segment_resamples_off_event_loop():
    """resample_poly is CPU-bound (seconds per max-length segment) and used
    to run directly on the event loop, freezing the whole service."""
    transcriber = AudioTranscriber()

    fake_transcript = Mock()
    fake_transcript.text = "hello"
    fake_transcript.duration = 1.0
    fake_transcript.segments = []
    transcriber.client = Mock()
    transcriber.client.audio.transcriptions.create = AsyncMock(
        return_value=fake_transcript
    )

    resample_threads = []
    real_resample = scipy_signal.resample_poly

    def recording_resample(*args, **kwargs):
        resample_threads.append(threading.get_ident())
        return real_resample(*args, **kwargs)

    with patch(
        "app.services.audio.transcriber.signal.resample_poly",
        side_effect=recording_resample,
    ):
        result = await transcriber._transcribe_segment(b"\x00\x01" * 1600)

    assert result is not None
    assert result["text"] == "hello"
    assert resample_threads, "resample_poly was never called"
    assert resample_threads[0] != threading.get_ident()
