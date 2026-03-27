import math
from types import SimpleNamespace
import os
import sys

import numpy as np
import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

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


class _NoopAsyncOpenAI:
    def __init__(self, *args, **kwargs):
        self.audio = SimpleNamespace(
            transcriptions=SimpleNamespace(create=self._unused_create)
        )

    async def _unused_create(self, **_kwargs):
        raise AssertionError("Test should inject a fake transcriptions client.")


@pytest.fixture(autouse=True)
def _no_api_key(monkeypatch):
    # Tests should never rely on real OpenAI credentials.
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.setattr(
        "app.services.audio.transcriber.AsyncOpenAI",
        _NoopAsyncOpenAI,
    )


@pytest.mark.asyncio
async def test_silence_audio_sample_skips_transcription():
    transcriber = AudioTranscriber()
    fake = _FakeTranscriptions(["unused"])
    transcriber.client = SimpleNamespace(audio=SimpleNamespace(transcriptions=fake))

    silence = _pcm_sample(duration_sec=0.8, amplitude=0)
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

    voiced = _pcm_sample(duration_sec=0.8, amplitude=2500)
    silence = _pcm_sample(duration_sec=0.6, amplitude=0)

    hold_transcript = await transcriber.process_chunk(voiced)
    if hold_transcript is None:
        hold_transcript = await transcriber.process_chunk(silence)

    non_hold_transcript = await transcriber.process_chunk(voiced)
    if non_hold_transcript is None:
        non_hold_transcript = await transcriber.process_chunk(silence)

    assert hold_transcript is not None
    assert non_hold_transcript is not None

    hold_result = await detector.detect(hold_transcript["text"])
    non_hold_result = await detector.detect(non_hold_transcript["text"])

    assert hold_result["is_hold"] is True
    assert non_hold_result["is_hold"] is False
    assert hold_result["detection_method"] in {
        "semantic_similarity",
        "rule_based_exact_phrase",
        "rule_based_keywords",
    }
    assert "put your call on hold" in hold_result["matched_phrase"]


@pytest.mark.asyncio
async def test_transcriber_rejects_non_bytes_audio_data():
    transcriber = AudioTranscriber()
    with pytest.raises(TypeError):
        await transcriber.process_chunk("not-bytes")  # type: ignore[arg-type]
