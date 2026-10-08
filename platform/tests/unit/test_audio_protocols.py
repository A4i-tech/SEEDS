"""The audio pipeline's structural protocols — consumers check shape, not inheritance."""

from __future__ import annotations

from app.services.audio.protocols import HoldDetectorProtocol, TranscriberProtocol


class DuckTranscriber:
    async def process_chunk(self, audio_data: bytes):
        return {"text": "hello"}


class DuckHoldDetector:
    async def detect(self, text: str):
        return {"on_hold": False}


def test_anything_with_process_chunk_counts_as_a_transcriber() -> None:
    assert isinstance(DuckTranscriber(), TranscriberProtocol)


def test_anything_with_detect_counts_as_a_hold_detector() -> None:
    assert isinstance(DuckHoldDetector(), HoldDetectorProtocol)


def test_the_protocols_are_not_interchangeable() -> None:
    assert not isinstance(DuckTranscriber(), HoldDetectorProtocol)
    assert not isinstance(DuckHoldDetector(), TranscriberProtocol)
