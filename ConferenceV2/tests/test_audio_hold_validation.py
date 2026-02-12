import math
from types import SimpleNamespace

import numpy as np
import pytest

from app.services.audio.hold_detector import HoldDetector
from app.services.audio.transcriber import AudioTranscriber


def _pcm_sample(duration_sec: float, rate: int = 8000, amplitude: int = 0, freq: float = 440.0) -> bytes:
    total = int(duration_sec * rate)
    if amplitude <= 0:
        arr = np.zeros(total, dtype=np.int16)
    else:
        t = np.arange(total, dtype=np.float32) / rate
        arr = (amplitude * np.sin(2.0 * math.pi * freq * t)).astype(np.int16)
    return arr.tobytes()


class _FakeSegment:
    def __init__(self, text: str):
        self.start = 0.0
        self.end = 1.0
        self.text = text


class _FakeTranscript:
    def __init__(self, text: str):
        self.text = text
        self.duration = 8.0
        self.segments = [_FakeSegment(text)]


class _FakeTranscriptions:
    def __init__(self, texts: list[str]):
        self._texts = texts
        self.call_count = 0

    async def create(self, **_kwargs):
        text = self._texts[self.call_count]
        self.call_count += 1
        return _FakeTranscript(text)


@pytest.mark.asyncio
async def test_silence_audio_sample_skips_transcription():
    transcriber = AudioTranscriber()
    fake = _FakeTranscriptions(["unused"])
    transcriber.client = SimpleNamespace(audio=SimpleNamespace(transcriptions=fake))

    silence = _pcm_sample(duration_sec=transcriber.BUFFER_DURATION_SEC, amplitude=0)
    result = await transcriber.process_chunk(silence)

    assert result is None
    assert fake.call_count == 0


@pytest.mark.asyncio
async def test_audio_samples_validate_hold_and_non_hold_detection():
    transcriber = AudioTranscriber()
    fake = _FakeTranscriptions(
        [
            "The number you have called has currently put your call on hold. Please stay on the line.",
            "Good morning class, today we are learning alphabets.",
        ]
    )
    transcriber.client = SimpleNamespace(audio=SimpleNamespace(transcriptions=fake))

    detector = HoldDetector()
    detector.hold_embeddings = [[1.0, 0.0]]

    async def _fake_get_embeddings(texts):
        out = []
        for text in texts:
            low = text.lower()
            if "put your call on hold" in low and "stay on the line" in low:
                out.append([1.0, 0.0])
            else:
                out.append([0.0, 1.0])
        return out

    detector._get_embeddings = _fake_get_embeddings  # type: ignore[method-assign]

    voiced = _pcm_sample(duration_sec=transcriber.BUFFER_DURATION_SEC, amplitude=2500)

    hold_transcript = await transcriber.process_chunk(voiced)
    non_hold_transcript = await transcriber.process_chunk(voiced)

    assert hold_transcript is not None
    assert non_hold_transcript is not None

    hold_result = await detector.detect(hold_transcript["text"])
    non_hold_result = await detector.detect(non_hold_transcript["text"])

    assert hold_result["is_hold"] is True
    assert non_hold_result["is_hold"] is False
    assert hold_result["detection_method"] == "semantic_similarity"
    assert "put your call on hold" in hold_result["matched_phrase"]


@pytest.mark.asyncio
async def test_transcriber_buffer_is_capped_under_bursty_input():
    transcriber = AudioTranscriber()
    transcriber.buffer_limit_bytes = 10_000_000
    transcriber.max_buffer_bytes = 20_000

    burst = b"x" * 50_000
    result = await transcriber.process_chunk(burst)

    assert result is None
    assert len(transcriber.buffer) == transcriber.max_buffer_bytes
