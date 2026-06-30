"""
Audio transcription service using OpenAI Whisper.

Ported from ConferenceV2 app/services/audio/transcriber.py.

SECURITY:
  - Transcript text is redacted in logs unless AUDIO_TRANSCRIPT_LOGGING_ENABLED=true.
  - OPENAI_API_KEY is never logged.
"""

from __future__ import annotations

import asyncio
import io
import logging
import wave
from collections import deque
from typing import Any

import numpy as np
from scipy import signal  # type: ignore[import-untyped]

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)

try:
    import webrtcvad  # type: ignore[import-untyped]
except Exception:
    webrtcvad = None  # type: ignore[assignment]


class AudioTranscriber:
    """VAD-gated Whisper transcriber for 8 kHz PCM audio."""

    INPUT_RATE = 8000
    PROCESS_RATE = 16000
    SILENCE_THRESHOLD = 300

    def __init__(self) -> None:

        settings = get_settings()
        from openai import AsyncOpenAI  # type: ignore[import-untyped]  # noqa: PLC0415

        self.client: AsyncOpenAI | None = None
        self.analysis_enabled = settings.audio_analysis_enabled
        if self.analysis_enabled and settings.openai_api_key:
            self.client = AsyncOpenAI(api_key=settings.openai_api_key)
        elif self.analysis_enabled:
            logger.warning("AudioTranscriber: OPENAI_API_KEY not set — transcription disabled")
        else:
            logger.info("AudioTranscriber: AUDIO_ANALYSIS_ENABLED=false")

        self.transcript_logging = settings.audio_transcript_logging_enabled
        self.api_timeout = settings.audio_api_timeout_seconds
        self.silence_threshold = settings.audio_silence_threshold
        self.frame_duration_ms = settings.audio_vad_frame_ms
        if self.frame_duration_ms not in (10, 20, 30):
            logger.warning("Invalid AUDIO_VAD_FRAME_MS=%s; using 20ms", self.frame_duration_ms)
            self.frame_duration_ms = 20

        self.vad_aggressiveness = max(0, min(3, settings.audio_webrtc_vad_aggressiveness))
        self.min_speech_ms = settings.audio_vad_min_speech_ms
        self.silence_flush_ms = settings.audio_vad_silence_flush_ms
        self.max_segment_sec = settings.audio_vad_max_segment_sec
        self.start_speech_frames = max(1, settings.audio_vad_start_speech_frames)
        self.frame_bytes = int(self.INPUT_RATE * 2 * self.frame_duration_ms / 1000)
        self.max_segment_bytes = int(self.INPUT_RATE * 2 * self.max_segment_sec)
        pre_speech_ms = settings.audio_vad_pre_speech_ms
        self.pre_speech_frames_count = max(1, pre_speech_ms // self.frame_duration_ms)
        self.overlap_bytes = int(self.INPUT_RATE * 2 * settings.audio_vad_overlap_ms / 1000)
        self.end_silence_frames = max(1, self.silence_flush_ms // self.frame_duration_ms)
        self.metrics_log_every_segments = max(1, settings.audio_vad_metrics_log_every_segments)

        self.pending_frame_buffer = bytearray()
        self.segment_buffer = bytearray()
        self.pre_speech_buffer: deque[bytes] = deque(maxlen=self.pre_speech_frames_count)
        self.prev_tail_overlap = b""
        self.segment_active = False
        self.speech_frames = 0
        self.trailing_silence_frames = 0
        self.voiced_streak = 0
        self.metrics: dict[str, int] = {
            "frames_total": 0, "frames_voiced": 0, "segments_emitted": 0,
            "segments_dropped_short": 0, "segments_transcribed": 0,
        }
        self._rms_window: deque[float] = deque(maxlen=50)
        self._rms_calibration_factor = 1.5
        self._rms_calibrated = False
        self.use_webrtc_vad = webrtcvad is not None
        self.vad = None
        if self.use_webrtc_vad:
            self.vad = webrtcvad.Vad(self.vad_aggressiveness)

    async def process_chunk(self, audio_data: bytes) -> dict[str, Any] | None:
        if not audio_data:
            return None
        self.pending_frame_buffer.extend(audio_data)
        results: list[dict[str, Any]] = []
        while len(self.pending_frame_buffer) >= self.frame_bytes:
            frame = bytes(self.pending_frame_buffer[: self.frame_bytes])
            del self.pending_frame_buffer[: self.frame_bytes]
            maybe = await self._consume_frame(frame)
            if maybe:
                results.append(maybe)
        if not results:
            return None
        if len(results) == 1:
            return results[0]
        merged_text = " ".join((r.get("text") or "").strip() for r in results).strip()
        return {"text": merged_text, "duration": sum(r.get("duration") or 0 for r in results), "segments": [], "transcript_chunks": results}

    def _is_voiced_frame(self, frame: bytes) -> bool:
        if self.use_webrtc_vad and self.vad is not None:
            try:
                return bool(self.vad.is_speech(frame, self.INPUT_RATE))
            except Exception:
                pass
        audio_np = np.frombuffer(frame, dtype=np.int16)
        rms = float(np.sqrt(np.mean(audio_np.astype(np.float64) ** 2)))
        self._rms_window.append(rms)
        if len(self._rms_window) >= self._rms_window.maxlen:
            mean_rms = sum(self._rms_window) / len(self._rms_window)
            return rms >= mean_rms * self._rms_calibration_factor
        return rms >= self.silence_threshold

    async def _consume_frame(self, frame: bytes) -> dict[str, Any] | None:
        is_voiced = self._is_voiced_frame(frame)
        self.metrics["frames_total"] += 1
        if is_voiced:
            self.metrics["frames_voiced"] += 1
        if not self.segment_active:
            self.pre_speech_buffer.append(frame)
            self.voiced_streak = (self.voiced_streak + 1) if is_voiced else 0
            if self.voiced_streak >= self.start_speech_frames:
                self.segment_active = True
                self.segment_buffer = bytearray(self.prev_tail_overlap)
                for f in self.pre_speech_buffer:
                    self.segment_buffer.extend(f)
                self.pre_speech_buffer.clear()
                self.speech_frames = self.voiced_streak
                self.trailing_silence_frames = 0
            return None
        if is_voiced:
            self.segment_buffer.extend(frame)
            self.speech_frames += 1
            self.trailing_silence_frames = 0
        else:
            self.segment_buffer.extend(frame)
            self.trailing_silence_frames += 1

        speech_ms = self.speech_frames * self.frame_duration_ms
        if self.trailing_silence_frames >= self.end_silence_frames or len(self.segment_buffer) >= self.max_segment_bytes:
            seg = bytes(self.segment_buffer)
            self.prev_tail_overlap = seg[-self.overlap_bytes:] if self.overlap_bytes > 0 else b""
            self.segment_buffer = bytearray()
            self.segment_active = False
            self.speech_frames = 0
            self.trailing_silence_frames = 0
            self.voiced_streak = 0
            if speech_ms < self.min_speech_ms:
                self.metrics["segments_dropped_short"] += 1
                return None
            self.metrics["segments_emitted"] += 1
            return await self._transcribe_segment(seg)
        return None

    async def _transcribe_segment(self, segment_bytes: bytes) -> dict[str, Any] | None:
        if not segment_bytes or not self.client:
            return None
        try:
            audio_np = np.frombuffer(segment_bytes, dtype=np.int16).astype(np.float32)
            resampled = await asyncio.to_thread(
                lambda: signal.resample_poly(audio_np, self.PROCESS_RATE, self.INPUT_RATE).astype(np.int16)
            )
            buf = io.BytesIO()
            with wave.open(buf, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(self.PROCESS_RATE)
                wf.writeframes(resampled.tobytes())
            buf.seek(0)
            buf.name = "audio.wav"
            transcript = await asyncio.wait_for(
                self.client.audio.transcriptions.create(
                    model="whisper-1", file=buf, language="en", response_format="verbose_json"
                ),
                timeout=self.api_timeout,
            )
            text = transcript.text.strip()
            if text:
                if not self.transcript_logging:
                    logger.debug("AudioTranscriber: transcription <redacted len=%d>", len(text))
                self.metrics["segments_transcribed"] += 1
                return {"text": text, "duration": transcript.duration, "segments": [], "transcript_chunks": [{"text": text, "duration": transcript.duration, "segments": []}]}
        except Exception as exc:
            logger.exception("AudioTranscriber: API error — %s", exc)
        return None
