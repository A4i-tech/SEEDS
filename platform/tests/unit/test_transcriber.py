"""Coverage for app.services.audio.transcriber.AudioTranscriber."""

from __future__ import annotations

import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

import app.services.audio.transcriber as transcriber_module
from app.services.audio.transcriber import AudioTranscriber


def _make_settings(**overrides):
    base = {
        "audio_analysis_enabled": True,
        "openai_api_key": "sk-test",
        "audio_transcript_logging_enabled": False,
        "audio_api_timeout_seconds": 8.0,
        "audio_silence_threshold": 300,
        "audio_vad_frame_ms": 20,
        "audio_webrtc_vad_aggressiveness": 2,
        "audio_vad_min_speech_ms": 200,
        "audio_vad_silence_flush_ms": 400,
        "audio_vad_max_segment_sec": 12.0,
        "audio_vad_start_speech_frames": 2,
        "audio_vad_pre_speech_ms": 120,
        "audio_vad_overlap_ms": 120,
        "audio_vad_metrics_log_every_segments": 20,
    }
    base.update(overrides)
    return SimpleNamespace(**base)


def _make_transcriber(settings=None, webrtcvad_mod=None, monkeypatch=None, openai_cls=None):
    settings = settings or _make_settings()
    with (
        patch("app.services.audio.transcriber.get_settings", return_value=settings),
        patch("openai.AsyncOpenAI", openai_cls or MagicMock(return_value=MagicMock())),
    ):
        if monkeypatch is not None:
            monkeypatch.setattr(transcriber_module, "webrtcvad", webrtcvad_mod)
        return AudioTranscriber()


def _frame(n_bytes: int, amplitude: int = 0) -> bytes:
    n_samples = n_bytes // 2
    arr = np.full(n_samples, amplitude, dtype=np.int16)
    return arr.tobytes()


class TestInit:
    def test_client_created_when_enabled_and_key_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_analysis_enabled=True, openai_api_key="sk-test")
        mock_openai = MagicMock(return_value=MagicMock())
        t = _make_transcriber(settings, monkeypatch=monkeypatch, openai_cls=mock_openai)
        assert t.client is not None
        mock_openai.assert_called_once_with(api_key="sk-test")

    def test_client_none_when_enabled_but_no_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_analysis_enabled=True, openai_api_key="")
        t = _make_transcriber(settings, monkeypatch=monkeypatch)
        assert t.client is None

    def test_client_none_when_analysis_disabled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_analysis_enabled=False, openai_api_key="sk-test")
        t = _make_transcriber(settings, monkeypatch=monkeypatch)
        assert t.client is None
        assert t.analysis_enabled is False

    def test_invalid_frame_duration_falls_back_to_20ms(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_vad_frame_ms=15)
        t = _make_transcriber(settings, monkeypatch=monkeypatch)
        assert t.frame_duration_ms == 20

    def test_valid_frame_duration_is_kept(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_vad_frame_ms=30)
        t = _make_transcriber(settings, monkeypatch=monkeypatch)
        assert t.frame_duration_ms == 30

    def test_vad_aggressiveness_clamped_above_max(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_webrtc_vad_aggressiveness=10)
        t = _make_transcriber(settings, monkeypatch=monkeypatch)
        assert t.vad_aggressiveness == 3

    def test_vad_aggressiveness_clamped_below_min(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_webrtc_vad_aggressiveness=-5)
        t = _make_transcriber(settings, monkeypatch=monkeypatch)
        assert t.vad_aggressiveness == 0

    def test_start_speech_frames_minimum_is_one(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_vad_start_speech_frames=0)
        t = _make_transcriber(settings, monkeypatch=monkeypatch)
        assert t.start_speech_frames == 1

    def test_derived_byte_fields_computed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_vad_frame_ms=20, audio_vad_max_segment_sec=1.0, audio_vad_overlap_ms=0)
        t = _make_transcriber(settings, monkeypatch=monkeypatch)
        assert t.frame_bytes == int(8000 * 2 * 20 / 1000)
        assert t.max_segment_bytes == int(8000 * 2 * 1.0)
        assert t.overlap_bytes == 0

    def test_uses_webrtc_vad_when_module_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fake_vad_mod = MagicMock()
        fake_vad_mod.Vad.return_value = "vad-instance"
        t = _make_transcriber(webrtcvad_mod=fake_vad_mod, monkeypatch=monkeypatch)
        assert t.use_webrtc_vad is True
        assert t.vad == "vad-instance"

    def test_no_webrtc_vad_when_module_absent(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert t.use_webrtc_vad is False
        assert t.vad is None


class TestProcessChunk:
    async def test_empty_audio_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(monkeypatch=monkeypatch)
        assert await t.process_chunk(b"") is None

    async def test_insufficient_bytes_buffers_without_result(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(monkeypatch=monkeypatch)
        t._consume_frame = AsyncMock(return_value=None)
        data = b"\x00" * (t.frame_bytes - 2)
        result = await t.process_chunk(data)
        assert result is None
        t._consume_frame.assert_not_called()
        assert bytes(t.pending_frame_buffer) == data

    async def test_single_segment_result_returned_directly(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(monkeypatch=monkeypatch)
        t._consume_frame = AsyncMock(return_value={"text": "hello", "duration": 1.0})
        result = await t.process_chunk(b"\x00" * t.frame_bytes)
        assert result == {"text": "hello", "duration": 1.0}

    async def test_multiple_segment_results_are_merged(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(monkeypatch=monkeypatch)
        side_effects = [{"text": "hello", "duration": 1.0}, {"text": "world", "duration": 2.0}]
        t._consume_frame = AsyncMock(side_effect=side_effects)
        result = await t.process_chunk(b"\x00" * (t.frame_bytes * 2))
        assert result["text"] == "hello world"
        assert result["duration"] == 3.0
        assert result["segments"] == []
        assert result["transcript_chunks"] == side_effects

    async def test_frames_with_no_results_return_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(monkeypatch=monkeypatch)
        t._consume_frame = AsyncMock(return_value=None)
        result = await t.process_chunk(b"\x00" * (t.frame_bytes * 2))
        assert result is None


class TestIsVoicedFrame:
    def test_uses_webrtc_vad_result_when_available(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fake_vad_mod = MagicMock()
        fake_vad_mod.Vad.return_value = MagicMock(is_speech=MagicMock(return_value=True))
        t = _make_transcriber(webrtcvad_mod=fake_vad_mod, monkeypatch=monkeypatch)
        assert t._is_voiced_frame(_frame(t.frame_bytes)) is True

    def test_webrtc_vad_exception_falls_back_to_rms(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fake_vad_mod = MagicMock()
        fake_vad_mod.Vad.return_value = MagicMock(is_speech=MagicMock(side_effect=RuntimeError("bad frame")))
        settings = _make_settings(audio_silence_threshold=50)
        t = _make_transcriber(settings, webrtcvad_mod=fake_vad_mod, monkeypatch=monkeypatch)
        assert t._is_voiced_frame(_frame(t.frame_bytes, amplitude=100)) is True
        assert t._is_voiced_frame(_frame(t.frame_bytes, amplitude=10)) is False

    def test_rms_below_threshold_is_unvoiced_before_window_full(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_silence_threshold=1000)
        t = _make_transcriber(settings, webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert t._is_voiced_frame(_frame(t.frame_bytes, amplitude=1)) is False

    def test_rms_above_threshold_is_voiced_before_window_full(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_silence_threshold=10)
        t = _make_transcriber(settings, webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert t._is_voiced_frame(_frame(t.frame_bytes, amplitude=1000)) is True

    def test_rms_calibration_once_window_full(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_silence_threshold=0)
        t = _make_transcriber(settings, webrtcvad_mod=None, monkeypatch=monkeypatch)
        for _ in range(t._rms_window.maxlen):
            t._is_voiced_frame(_frame(t.frame_bytes, amplitude=100))
        assert t._is_voiced_frame(_frame(t.frame_bytes, amplitude=100)) is False
        assert t._is_voiced_frame(_frame(t.frame_bytes, amplitude=10000)) is True


class TestConsumeFrame:
    def _settings(self):
        return _make_settings(
            audio_vad_start_speech_frames=2,
            audio_vad_silence_flush_ms=40,
            audio_vad_frame_ms=20,
            audio_vad_min_speech_ms=40,
            audio_vad_max_segment_sec=10.0,
            audio_vad_overlap_ms=0,
            audio_silence_threshold=10,
        )

    async def test_inactive_segment_buffers_pre_speech_frames(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(self._settings(), webrtcvad_mod=None, monkeypatch=monkeypatch)
        result = await t._consume_frame(_frame(t.frame_bytes, amplitude=0))
        assert result is None
        assert t.segment_active is False
        assert len(t.pre_speech_buffer) == 1

    async def test_segment_activates_after_start_speech_frames(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(self._settings(), webrtcvad_mod=None, monkeypatch=monkeypatch)
        voiced = _frame(t.frame_bytes, amplitude=1000)
        await t._consume_frame(voiced)
        await t._consume_frame(voiced)
        assert t.segment_active is True
        assert t.speech_frames == 2

    async def test_segment_finalizes_after_trailing_silence(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = self._settings()
        settings.audio_vad_min_speech_ms = 20
        t = _make_transcriber(settings, webrtcvad_mod=None, monkeypatch=monkeypatch)
        t._transcribe_segment = AsyncMock(return_value={"text": "ok", "duration": 1.0})

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)

        await t._consume_frame(voiced)
        await t._consume_frame(voiced)  # activates, speech_frames=2 -> 40ms
        result = await t._consume_frame(silent)  # end_silence_frames=2, 1 silent frame so far
        assert result is None
        result = await t._consume_frame(silent)  # second consecutive silent frame -> finalize
        assert result == {"text": "ok", "duration": 1.0}
        assert t.segment_active is False
        t._transcribe_segment.assert_awaited_once()

    async def test_short_segment_is_dropped_without_transcribing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = self._settings()
        settings.audio_vad_min_speech_ms = 1000
        t = _make_transcriber(settings, webrtcvad_mod=None, monkeypatch=monkeypatch)
        t._transcribe_segment = AsyncMock()

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)

        await t._consume_frame(voiced)
        await t._consume_frame(voiced)
        await t._consume_frame(silent)
        result = await t._consume_frame(silent)

        assert result is None
        t._transcribe_segment.assert_not_called()
        assert t.metrics["segments_dropped_short"] == 1

    async def test_segment_finalizes_when_max_segment_bytes_exceeded(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = self._settings()
        settings.audio_vad_max_segment_sec = 0.001
        settings.audio_vad_min_speech_ms = 0
        settings.audio_vad_silence_flush_ms = 100000
        t = _make_transcriber(settings, webrtcvad_mod=None, monkeypatch=monkeypatch)
        t._transcribe_segment = AsyncMock(return_value=None)

        voiced = _frame(t.frame_bytes, amplitude=1000)
        await t._consume_frame(voiced)  # streak 1, inactive
        await t._consume_frame(voiced)  # streak 2 -> activates, returns None
        result = await t._consume_frame(voiced)  # buffer now exceeds max_segment_bytes -> finalizes

        t._transcribe_segment.assert_awaited_once_with(voiced * 3)
        assert result is None
        assert t.segment_active is False
        assert t.metrics["segments_emitted"] == 1


class TestTranscribeSegment:
    async def test_empty_segment_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(monkeypatch=monkeypatch)
        assert await t._transcribe_segment(b"") is None

    async def test_no_client_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_analysis_enabled=False)
        t = _make_transcriber(settings, monkeypatch=monkeypatch)
        assert t.client is None
        assert await t._transcribe_segment(_frame(320, amplitude=100)) is None

    async def test_successful_transcription_returns_payload(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
        t = _make_transcriber(monkeypatch=monkeypatch)
        fake_transcript = SimpleNamespace(text=" hello world ", duration=1.5)
        t.client = MagicMock()
        t.client.audio.transcriptions.create = AsyncMock(return_value=fake_transcript)

        with caplog.at_level(logging.DEBUG, logger="app.services.audio.transcriber"):
            result = await t._transcribe_segment(_frame(3200, amplitude=5000))

        assert result["text"] == "hello world"
        assert result["duration"] == 1.5
        assert result["transcript_chunks"][0]["text"] == "hello world"
        assert t.metrics["segments_transcribed"] == 1
        assert "AudioTranscriber: transcription <redacted len=11>" in caplog.text
        assert "hello world" not in caplog.text

    async def test_empty_transcript_text_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(monkeypatch=monkeypatch)
        fake_transcript = SimpleNamespace(text="   ", duration=1.0)
        t.client = MagicMock()
        t.client.audio.transcriptions.create = AsyncMock(return_value=fake_transcript)

        result = await t._transcribe_segment(_frame(3200, amplitude=5000))

        assert result is None

    async def test_api_exception_is_swallowed_and_returns_none(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
        t = _make_transcriber(monkeypatch=monkeypatch)
        t.client = MagicMock()
        t.client.audio.transcriptions.create = AsyncMock(side_effect=RuntimeError("api down"))

        with caplog.at_level(logging.ERROR, logger="app.services.audio.transcriber"):
            result = await t._transcribe_segment(_frame(3200, amplitude=5000))

        assert result is None
        assert t.metrics["segments_transcribed"] == 0
        assert "AudioTranscriber: API error" in caplog.text
        assert "api down" in caplog.text

    async def test_transcript_logging_enabled_skips_redaction(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
        settings = _make_settings(audio_transcript_logging_enabled=True)
        t = _make_transcriber(settings, monkeypatch=monkeypatch)
        fake_transcript = SimpleNamespace(text="visible text", duration=0.5)
        t.client = MagicMock()
        t.client.audio.transcriptions.create = AsyncMock(return_value=fake_transcript)

        with caplog.at_level(logging.DEBUG, logger="app.services.audio.transcriber"):
            result = await t._transcribe_segment(_frame(3200, amplitude=5000))

        assert result["text"] == "visible text"
        assert "redacted" not in caplog.text
