"""Coverage for app.services.audio.transcriber.AudioTranscriber."""

from __future__ import annotations

import builtins
import importlib
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

import numpy as np
import pytest

import app.services.audio.transcriber as transcriber_module
from app.platform.settings import Settings
from app.services.audio.transcriber import AudioTranscriber

_BASE_SETTINGS = Settings(
    audio_analysis_enabled=True,
    openai_api_key="sk-test",
    audio_transcript_logging_enabled=False,
    audio_api_timeout_seconds=8.0,
    audio_silence_threshold=300,
    audio_vad_frame_ms=20,
    audio_webrtc_vad_aggressiveness=2,
    audio_vad_min_speech_ms=200,
    audio_vad_silence_flush_ms=400,
    audio_vad_max_segment_sec=12.0,
    audio_vad_start_speech_frames=2,
    audio_vad_pre_speech_ms=120,
    audio_vad_overlap_ms=120,
    audio_vad_metrics_log_every_segments=20,
)


def _make_settings(**overrides):
    return _BASE_SETTINGS.model_copy(update=overrides) if overrides else _BASE_SETTINGS


def _vad_settings(**overrides):
    base = {
        "audio_vad_start_speech_frames": 2,
        "audio_vad_silence_flush_ms": 40,
        "audio_vad_frame_ms": 20,
        "audio_vad_min_speech_ms": 40,
        "audio_vad_max_segment_sec": 10.0,
        "audio_vad_overlap_ms": 0,
        "audio_silence_threshold": 10,
    }
    base.update(overrides)
    return _make_settings(**base)


def _make_transcriber(*, settings, openai_cls, webrtcvad_mod, monkeypatch):
    with (
        patch("app.services.audio.transcriber.get_settings", return_value=settings),
        patch("openai.AsyncOpenAI", openai_cls),
    ):
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
        t = _make_transcriber(settings=settings, openai_cls=mock_openai, webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert t.client == mock_openai.return_value
        mock_openai.assert_called_once_with(api_key="sk-test")

    def test_client_none_when_enabled_but_no_key(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_analysis_enabled=True, openai_api_key="")
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert t.client is None

    def test_client_none_when_analysis_disabled(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_analysis_enabled=False, openai_api_key="sk-test")
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert t.client is None
        assert t.analysis_enabled is False

    def test_valid_frame_duration_is_kept(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_vad_frame_ms=30)
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert t.frame_duration_ms == 30

    def test_derived_byte_fields_computed(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_vad_frame_ms=20, audio_vad_max_segment_sec=1.0, audio_vad_overlap_ms=0)
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert t.frame_bytes == int(8000 * 2 * 20 / 1000)
        assert t.max_segment_bytes == int(8000 * 2 * 1.0)
        assert t.overlap_bytes == 0

    def test_uses_webrtc_vad_when_module_present(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fake_vad_mod = MagicMock()
        fake_vad_mod.Vad.return_value = "vad-instance"
        t = _make_transcriber(settings=_make_settings(), openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=fake_vad_mod, monkeypatch=monkeypatch)
        assert t.use_webrtc_vad is True
        assert t.vad == "vad-instance"

    def test_no_webrtc_vad_when_module_absent(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(settings=_make_settings(), openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert t.use_webrtc_vad is False
        assert t.vad is None


class TestProcessChunk:
    async def test_empty_audio_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(settings=_make_settings(), openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert await t.process_chunk(b"") is None

    async def test_insufficient_bytes_buffers_without_result(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(settings=_make_settings(), openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        data = b"\x00" * (t.frame_bytes - 2)
        result = await t.process_chunk(data)
        assert result is None
        assert bytes(t.pending_frame_buffer) == data

    async def test_single_segment_result_returned_directly(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _vad_settings()
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        t.client.audio.transcriptions.create = AsyncMock(
            return_value=SimpleNamespace(text="hello", duration=1.0)
        )

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)
        result = await t.process_chunk(voiced + voiced + silent + silent)

        assert result["text"] == "hello"
        assert result["duration"] == 1.0
        t.client.audio.transcriptions.create.assert_awaited_once()

    async def test_multiple_segment_results_are_merged(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _vad_settings()
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        t.client.audio.transcriptions.create = AsyncMock(
            side_effect=[
                SimpleNamespace(text="hello", duration=1.0),
                SimpleNamespace(text="world", duration=2.0),
            ]
        )

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)
        segment = voiced + voiced + silent + silent
        result = await t.process_chunk(segment + segment)

        assert result["text"] == "hello world"
        assert result["duration"] == 3.0
        assert result["segments"] == []
        assert [chunk["text"] for chunk in result["transcript_chunks"]] == ["hello", "world"]

    async def test_frames_with_no_results_return_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(settings=_make_settings(), openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        silent = _frame(t.frame_bytes, amplitude=0)
        result = await t.process_chunk(silent + silent)
        assert result is None


class TestIsVoicedFrame:
    async def test_uses_webrtc_vad_result_when_available(self, monkeypatch: pytest.MonkeyPatch) -> None:
        fake_vad_mod = MagicMock()
        fake_vad_mod.Vad.return_value = MagicMock(is_speech=MagicMock(return_value=True))
        t = _make_transcriber(settings=_make_settings(), openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=fake_vad_mod, monkeypatch=monkeypatch)
        await t.process_chunk(_frame(t.frame_bytes))
        assert t.metrics["frames_voiced"] == 1

    async def test_webrtc_vad_exception_falls_back_to_rms(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
    ) -> None:
        fake_vad_mod = MagicMock()
        fake_vad_mod.Vad.return_value = MagicMock(is_speech=MagicMock(side_effect=RuntimeError("bad frame")))
        settings = _make_settings(audio_silence_threshold=50)
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=fake_vad_mod, monkeypatch=monkeypatch)

        with caplog.at_level(logging.WARNING, logger="app.services.audio.transcriber"):
            await t.process_chunk(_frame(t.frame_bytes, amplitude=100))
        assert t.metrics["frames_voiced"] == 1
        assert "webrtcvad.is_speech failed" in caplog.text

        await t.process_chunk(_frame(t.frame_bytes, amplitude=10))
        assert t.metrics["frames_voiced"] == 1

    async def test_rms_below_threshold_is_unvoiced_before_window_full(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_silence_threshold=1000)
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        await t.process_chunk(_frame(t.frame_bytes, amplitude=1))
        assert t.metrics["frames_voiced"] == 0

    async def test_rms_above_threshold_is_voiced_before_window_full(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_silence_threshold=10)
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        await t.process_chunk(_frame(t.frame_bytes, amplitude=1000))
        assert t.metrics["frames_voiced"] == 1

    async def test_rms_calibration_once_window_full(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _make_settings(audio_silence_threshold=0)
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        for _ in range(50):
            await t.process_chunk(_frame(t.frame_bytes, amplitude=100))

        voiced_before = t.metrics["frames_voiced"]
        await t.process_chunk(_frame(t.frame_bytes, amplitude=100))
        assert t.metrics["frames_voiced"] == voiced_before

        await t.process_chunk(_frame(t.frame_bytes, amplitude=10000))
        assert t.metrics["frames_voiced"] == voiced_before + 1


class TestConsumeFrame:
    def _settings(self):
        return _vad_settings()

    async def test_inactive_segment_buffers_pre_speech_frames(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(settings=self._settings(), openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        result = await t.process_chunk(_frame(t.frame_bytes, amplitude=0))
        assert result is None
        assert t.segment_active is False
        assert len(t.pre_speech_buffer) == 1

    async def test_segment_activates_after_start_speech_frames(self, monkeypatch: pytest.MonkeyPatch) -> None:
        t = _make_transcriber(settings=self._settings(), openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        voiced = _frame(t.frame_bytes, amplitude=1000)
        await t.process_chunk(voiced)
        await t.process_chunk(voiced)
        assert t.segment_active is True
        assert t.speech_frames == 2

    async def test_segment_finalizes_after_trailing_silence(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = self._settings()
        settings.audio_vad_min_speech_ms = 20
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        t.client.audio.transcriptions.create = AsyncMock(return_value=SimpleNamespace(text="ok", duration=1.0))

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)

        await t.process_chunk(voiced)
        await t.process_chunk(voiced)  # activates, speech_frames=2 -> 40ms
        result = await t.process_chunk(silent)  # end_silence_frames=2, 1 silent frame so far
        assert result is None
        result = await t.process_chunk(silent)  # second consecutive silent frame -> finalize
        assert result["text"] == "ok"
        assert result["duration"] == 1.0
        assert t.segment_active is False
        t.client.audio.transcriptions.create.assert_awaited_once()

    async def test_short_segment_is_dropped_without_transcribing(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = self._settings()
        settings.audio_vad_min_speech_ms = 1000
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        t.client.audio.transcriptions.create = AsyncMock()

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)

        await t.process_chunk(voiced)
        await t.process_chunk(voiced)
        await t.process_chunk(silent)
        result = await t.process_chunk(silent)

        assert result is None
        t.client.audio.transcriptions.create.assert_not_called()
        assert t.metrics["segments_dropped_short"] == 1

    async def test_segment_finalizes_when_max_segment_bytes_exceeded(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = self._settings()
        settings.audio_vad_max_segment_sec = 0.001
        settings.audio_vad_min_speech_ms = 0
        settings.audio_vad_silence_flush_ms = 100000
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        t.client.audio.transcriptions.create = AsyncMock(return_value=SimpleNamespace(text="", duration=0))

        voiced = _frame(t.frame_bytes, amplitude=1000)
        await t.process_chunk(voiced)  # streak 1, inactive
        await t.process_chunk(voiced)  # streak 2 -> activates, returns None
        result = await t.process_chunk(voiced)  # buffer now exceeds max_segment_bytes -> finalizes

        t.client.audio.transcriptions.create.assert_awaited_once()
        assert result is None
        assert t.segment_active is False
        assert t.metrics["segments_emitted"] == 1


class TestTranscribeSegment:
    async def test_no_client_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _vad_settings(audio_analysis_enabled=False)
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        assert t.client is None

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)
        result = await t.process_chunk(voiced + voiced + silent + silent)

        assert result is None

    async def test_successful_transcription_returns_payload(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
        settings = _vad_settings()
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        fake_transcript = SimpleNamespace(text=" hello world ", duration=1.5)
        t.client.audio.transcriptions.create = AsyncMock(return_value=fake_transcript)

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)
        with caplog.at_level(logging.DEBUG, logger="app.services.audio.transcriber"):
            result = await t.process_chunk(voiced + voiced + silent + silent)

        assert result["text"] == "hello world"
        assert result["duration"] == 1.5
        assert result["transcript_chunks"][0]["text"] == "hello world"
        assert t.metrics["segments_transcribed"] == 1
        assert "AudioTranscriber: transcription <redacted len=11>" in caplog.text
        assert "hello world" not in caplog.text

    async def test_empty_transcript_text_returns_none(self, monkeypatch: pytest.MonkeyPatch) -> None:
        settings = _vad_settings()
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        fake_transcript = SimpleNamespace(text="   ", duration=1.0)
        t.client.audio.transcriptions.create = AsyncMock(return_value=fake_transcript)

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)
        result = await t.process_chunk(voiced + voiced + silent + silent)

        assert result is None

    async def test_api_exception_is_swallowed_and_returns_none(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
        settings = _vad_settings()
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        t.client.audio.transcriptions.create = AsyncMock(side_effect=RuntimeError("api down"))

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)
        with caplog.at_level(logging.ERROR, logger="app.services.audio.transcriber"):
            result = await t.process_chunk(voiced + voiced + silent + silent)

        assert result is None
        assert t.metrics["segments_transcribed"] == 0
        assert "AudioTranscriber: API error" in caplog.text
        assert "api down" in caplog.text

    async def test_transcript_logging_enabled_skips_redaction(self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture) -> None:
        settings = _vad_settings(audio_transcript_logging_enabled=True)
        t = _make_transcriber(settings=settings, openai_cls=MagicMock(return_value=MagicMock()), webrtcvad_mod=None, monkeypatch=monkeypatch)
        fake_transcript = SimpleNamespace(text="visible text", duration=0.5)
        t.client.audio.transcriptions.create = AsyncMock(return_value=fake_transcript)

        voiced = _frame(t.frame_bytes, amplitude=1000)
        silent = _frame(t.frame_bytes, amplitude=0)
        with caplog.at_level(logging.DEBUG, logger="app.services.audio.transcriber"):
            result = await t.process_chunk(voiced + voiced + silent + silent)

        assert result["text"] == "visible text"
        assert "redacted" not in caplog.text


class TestWebrtcvadModuleImport:
    def test_import_error_falls_back_to_degraded_mode_with_log(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture,
    ) -> None:
        real_import = builtins.__import__

        def fake_import(name, *args, **kwargs):
            if name == "webrtcvad":
                raise ImportError("no module named webrtcvad")
            return real_import(name, *args, **kwargs)

        monkeypatch.setattr(builtins, "__import__", fake_import)
        try:
            with caplog.at_level(logging.WARNING, logger="app.services.audio.transcriber"):
                importlib.reload(transcriber_module)
            assert transcriber_module.webrtcvad is None
            assert "webrtcvad not available" in caplog.text
        finally:
            importlib.reload(transcriber_module)
