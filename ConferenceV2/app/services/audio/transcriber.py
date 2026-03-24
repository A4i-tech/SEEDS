import asyncio
import io
import os
import wave
from collections import deque
from typing import Any, Optional
import numpy as np
from scipy import signal
from openai import AsyncOpenAI
from app.conf_logger import logger_instance as logger


try:
    import webrtcvad  # type: ignore
except Exception:  # pragma: no cover - optional dependency at runtime
    webrtcvad = None


class AudioTranscriber:
    # Audio constants
    INPUT_RATE = 8000
    PROCESS_RATE = 16000

    # Energy fallback threshold (16-bit audio, max 32768). Used only when WebRTC VAD is unavailable.
    SILENCE_THRESHOLD = 300

    # WebRTC VAD defaults
    FRAME_DURATION_MS = 20
    WEBRTC_AGGRESSIVENESS = 2
    MIN_SPEECH_MS = 200
    SILENCE_FLUSH_MS = 400
    MAX_SEGMENT_SEC = 12
    START_SPEECH_FRAMES = 2
    PRE_SPEECH_MS = 120
    OVERLAP_MS = 120
    METRICS_LOG_EVERY_SEGMENTS = 20

    def __init__(self) -> None:
        logger.debug("Initializing AudioTranscriber (AsyncOpenAI API)...")
        api_key = os.environ.get("OPENAI_API_KEY")
        self.client: Optional[AsyncOpenAI] = None
        self.analysis_enabled = os.getenv("AUDIO_ANALYSIS_ENABLED", "true").lower() == "true"
        if self.analysis_enabled and api_key:
            self.client = AsyncOpenAI(api_key=api_key)
        elif self.analysis_enabled:
            logger.warning(
                "OPENAI_API_KEY not found in environment variables. Transcription calls are disabled."
            )
        else:
            logger.info("AUDIO_ANALYSIS_ENABLED=false. Transcription calls are disabled.")

        self.transcript_logging = os.getenv("AUDIO_TRANSCRIPT_LOGGING_ENABLED", "false").lower() == "true"
        self.api_timeout = float(os.getenv("AUDIO_API_TIMEOUT_SECONDS", "8.0"))

        self.silence_threshold = int(
            os.getenv("AUDIO_SILENCE_THRESHOLD", str(self.SILENCE_THRESHOLD))
        )

        self.frame_duration_ms = int(
            os.getenv("AUDIO_VAD_FRAME_MS", str(self.FRAME_DURATION_MS))
        )
        if self.frame_duration_ms not in (10, 20, 30):
            logger.warning(
                "Invalid AUDIO_VAD_FRAME_MS=%s; falling back to 20ms.",
                self.frame_duration_ms,
            )
            self.frame_duration_ms = 20

        self.vad_aggressiveness = int(
            os.getenv(
                "AUDIO_WEBRTC_VAD_AGGRESSIVENESS",
                str(self.WEBRTC_AGGRESSIVENESS),
            )
        )
        self.vad_aggressiveness = max(0, min(3, self.vad_aggressiveness))

        self.min_speech_ms = int(
            os.getenv("AUDIO_VAD_MIN_SPEECH_MS", str(self.MIN_SPEECH_MS))
        )
        self.silence_flush_ms = int(
            os.getenv("AUDIO_VAD_SILENCE_FLUSH_MS", str(self.SILENCE_FLUSH_MS))
        )
        self.max_segment_sec = float(
            os.getenv("AUDIO_VAD_MAX_SEGMENT_SEC", str(self.MAX_SEGMENT_SEC))
        )
        self.start_speech_frames = int(
            os.getenv("AUDIO_VAD_START_SPEECH_FRAMES", str(self.START_SPEECH_FRAMES))
        )
        self.start_speech_frames = max(1, self.start_speech_frames)

        self.frame_bytes = int(self.INPUT_RATE * 2 * self.frame_duration_ms / 1000)
        self.max_segment_bytes = int(self.INPUT_RATE * 2 * self.max_segment_sec)
        self.pre_speech_frames_count = max(
            1, int(os.getenv("AUDIO_VAD_PRE_SPEECH_MS", str(self.PRE_SPEECH_MS))) // self.frame_duration_ms
        )
        self.overlap_bytes = int(
            self.INPUT_RATE * 2 * int(os.getenv("AUDIO_VAD_OVERLAP_MS", str(self.OVERLAP_MS))) / 1000
        )
        self.end_silence_frames = max(1, self.silence_flush_ms // self.frame_duration_ms)
        self.metrics_log_every_segments = int(
            os.getenv("AUDIO_VAD_METRICS_LOG_EVERY_SEGMENTS", str(self.METRICS_LOG_EVERY_SEGMENTS))
        )
        self.metrics_log_every_segments = max(1, self.metrics_log_every_segments)

        self.pending_frame_buffer = bytearray()
        self.segment_buffer = bytearray()
        self.pre_speech_buffer = deque(maxlen=self.pre_speech_frames_count)
        self.prev_tail_overlap = b""
        self.segment_active = False
        self.speech_frames = 0
        self.trailing_silence_frames = 0
        self.voiced_streak = 0

        self.metrics = {
            "frames_total": 0,
            "frames_voiced": 0,
            "segments_emitted": 0,
            "segments_dropped_short": 0,
            "segments_transcribed": 0,
        }

        # Rolling RMS calibration for energy-based VAD fallback
        self._rms_window: deque[float] = deque(maxlen=50)
        self._rms_calibration_factor = 1.5
        self._rms_calibrated = False

        self.use_webrtc_vad = webrtcvad is not None
        self.vad = None
        if self.use_webrtc_vad:
            self.vad = webrtcvad.Vad(self.vad_aggressiveness)
            logger.info(
                "AudioTranscriber VAD backend: WebRTC (mode=%s, frame=%sms)",
                self.vad_aggressiveness,
                self.frame_duration_ms,
            )
        else:
            logger.warning(
                "webrtcvad package is not available; falling back to energy-based VAD."
            )

        logger.debug(
            "AudioTranscriber initialized (%sHz -> %sHz, min_speech=%sms, silence_flush=%sms).",
            self.INPUT_RATE,
            self.PROCESS_RATE,
            self.min_speech_ms,
            self.silence_flush_ms,
        )

    async def process_chunk(self, audio_data: bytes) -> Optional[dict[str, Any]]:
        if not audio_data:
            return None
        if not isinstance(audio_data, (bytes, bytearray)):
            raise TypeError("audio_data must be bytes-like")

        self.pending_frame_buffer.extend(audio_data)
        results: list[dict[str, Any]] = []

        while len(self.pending_frame_buffer) >= self.frame_bytes:
            frame = bytes(self.pending_frame_buffer[: self.frame_bytes])
            del self.pending_frame_buffer[: self.frame_bytes]
            maybe_result = await self._consume_frame(frame)
            if maybe_result:
                results.append(maybe_result)

        if not results:
            return None

        if len(results) == 1:
            return results[0]

        merged_segments: list[dict[str, Any]] = []
        merged_text_parts: list[str] = []
        merged_transcript_chunks: list[dict[str, Any]] = []
        merged_duration = 0.0

        for result in results:
            text = (result.get("text") or "").strip()
            if text:
                merged_text_parts.append(text)
            segments = result.get("segments") or []
            if isinstance(segments, list):
                merged_segments.extend(segments)
            duration = result.get("duration")
            if duration is not None:
                try:
                    merged_duration += float(duration)
                except (TypeError, ValueError):
                    pass
            transcript_chunks = result.get("transcript_chunks")
            if isinstance(transcript_chunks, list) and transcript_chunks:
                merged_transcript_chunks.extend(transcript_chunks)
            else:
                merged_transcript_chunks.append(
                    {
                        "text": text,
                        "duration": duration,
                        "segments": segments if isinstance(segments, list) else [],
                    }
                )

        merged_text = " ".join(merged_text_parts).strip()
        if not merged_text and merged_segments:
            merged_text = " ".join(
                (seg.get("text") or "").strip() for seg in merged_segments if isinstance(seg, dict)
            ).strip()

        return {
            "text": merged_text,
            "duration": merged_duration,
            "segments": merged_segments,
            "transcript_chunks": merged_transcript_chunks,
        }

    def _calculate_rms(self, audio_np: np.ndarray) -> float:
        # Root Mean Square amplitude on int16 PCM.
        if len(audio_np) == 0:
            return 0.0
        return np.sqrt(np.mean(audio_np.astype(np.float64) ** 2))

    def _is_voiced_frame(self, frame: bytes) -> bool:
        if self.use_webrtc_vad and self.vad is not None:
            try:
                return bool(self.vad.is_speech(frame, self.INPUT_RATE))
            except Exception as exc:
                logger.warning("WebRTC VAD frame detection failed, using energy fallback: %s", exc)

        audio_np = np.frombuffer(frame, dtype=np.int16)
        rms = self._calculate_rms(audio_np)

        # Rolling RMS calibration: adapt threshold after enough samples
        self._rms_window.append(rms)
        if len(self._rms_window) >= self._rms_window.maxlen:
            if not self._rms_calibrated:
                self._rms_calibrated = True
                logger.info("Energy-based VAD: RMS calibration active (window=%d)", self._rms_window.maxlen)
            mean_rms = sum(self._rms_window) / len(self._rms_window)
            adaptive_threshold = mean_rms * self._rms_calibration_factor
            return rms >= adaptive_threshold

        return rms >= self.silence_threshold

    async def _consume_frame(self, frame: bytes) -> Optional[dict[str, Any]]:
        is_voiced = self._is_voiced_frame(frame)
        self.metrics["frames_total"] += 1
        if is_voiced:
            self.metrics["frames_voiced"] += 1

        if not self.segment_active:
            self.pre_speech_buffer.append(frame)
            if is_voiced:
                self.voiced_streak += 1
            else:
                self.voiced_streak = 0

            if self.voiced_streak >= self.start_speech_frames:
                self.segment_active = True
                self.segment_buffer = bytearray(self.prev_tail_overlap)
                for buffered_frame in self.pre_speech_buffer:
                    self.segment_buffer.extend(buffered_frame)
                self.pre_speech_buffer.clear()
                self.speech_frames = self.voiced_streak
                self.trailing_silence_frames = 0
            else:
                return None
        elif is_voiced:
            self.segment_buffer.extend(frame)
            self.speech_frames += 1
            self.trailing_silence_frames = 0
        else:
            # Keep a short trailing silence tail for natural phrase boundary.
            self.segment_buffer.extend(frame)
            self.trailing_silence_frames += 1

        speech_ms = self.speech_frames * self.frame_duration_ms
        should_flush_for_silence = self.trailing_silence_frames >= self.end_silence_frames
        should_flush_for_size = len(self.segment_buffer) >= self.max_segment_bytes

        if should_flush_for_silence or should_flush_for_size:
            segment_bytes = bytes(self.segment_buffer)
            self.prev_tail_overlap = segment_bytes[-self.overlap_bytes :] if self.overlap_bytes > 0 else b""
            self.segment_buffer = bytearray()
            self.segment_active = False
            self.speech_frames = 0
            self.trailing_silence_frames = 0
            self.voiced_streak = 0

            if speech_ms < self.min_speech_ms:
                logger.debug(
                    "Discarded short speech segment (%sms < %sms).",
                    speech_ms,
                    self.min_speech_ms,
                )
                self.metrics["segments_dropped_short"] += 1
                return None

            self.metrics["segments_emitted"] += 1
            return await self._transcribe_segment(segment_bytes)

        return None

    async def _transcribe_segment(self, segment_bytes: bytes) -> Optional[dict[str, Any]]:
        if not segment_bytes:
            return None
        if not self.client:
            return None

        try:
            audio_np = np.frombuffer(segment_bytes, dtype=np.int16)
            audio_float = audio_np.astype(np.float32)

            # 8kHz PCM -> 16kHz for Whisper.
            resampled_float = signal.resample_poly(
                audio_float, self.PROCESS_RATE, self.INPUT_RATE
            )
            resampled_np = resampled_float.astype(np.int16)

            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(self.PROCESS_RATE)
                wf.writeframes(resampled_np.tobytes())

            wav_buffer.seek(0)
            wav_buffer.name = "audio.wav"

            logger.debug(
                "Sending segmented audio to Whisper (bytes=%s, frames=%s).",
                len(segment_bytes),
                len(audio_np),
            )
            transcript = await asyncio.wait_for(
                self.client.audio.transcriptions.create(
                    model="whisper-1",
                    file=wav_buffer,
                    language="en",
                    response_format="verbose_json",
                ),
                timeout=self.api_timeout,
            )

            text = transcript.text.strip()
            duration = transcript.duration
            segments = []
            if hasattr(transcript, "segments"):
                for seg in transcript.segments:
                    segments.append({
                        "start": seg.start,
                        "end": seg.end,
                        "text": seg.text.strip(),
                    })

            if text:
                if self.transcript_logging:
                    logger.debug("TRANSCRIPTION [Duration: %ss]: %s", duration, text)
                else:
                    logger.debug("TRANSCRIPTION [Duration: %ss]: <redacted len=%d>", duration, len(text))
                self.metrics["segments_transcribed"] += 1
                if (
                    self.metrics["segments_emitted"] > 0
                    and self.metrics["segments_emitted"] % self.metrics_log_every_segments == 0
                ):
                    voiced_ratio = (
                        self.metrics["frames_voiced"] / self.metrics["frames_total"]
                        if self.metrics["frames_total"] > 0
                        else 0.0
                    )
                    logger.info(
                        "VAD_METRICS: frames=%s voiced_ratio=%.3f emitted=%s transcribed=%s dropped_short=%s",
                        self.metrics["frames_total"],
                        voiced_ratio,
                        self.metrics["segments_emitted"],
                        self.metrics["segments_transcribed"],
                        self.metrics["segments_dropped_short"],
                    )
                return {
                    "text": text,
                    "duration": duration,
                    "segments": segments,
                    "transcript_chunks": [
                        {
                            "text": text,
                            "duration": duration,
                            "segments": segments,
                        }
                    ],
                }
            return None

        except Exception as e:
            logger.exception(f"OpenAI API Error: {e}")
            return None
