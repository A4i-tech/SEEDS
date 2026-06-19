"""
Audio recording consumer — receives audio frames and writes WAV segments to Azure Blob.

Ported from ConferenceV2 audio/audio_capture.py + audio/websocket_audio_processor.py.

Architecture:
  - Receives (conference_id, audio_bytes) tuples from an in-process asyncio queue.
  - Buffers frames into a WAV file via AudioCaptureService.
  - On finalize (conference end), uploads to Azure Blob Storage.
  - Signals AudioAnalysisConsumer via a shared in-process queue.

SECURITY:
  - Raw audio bytes are NEVER logged (PII risk).
  - Azure connection string is never logged.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Optional

from app.consumers.base_consumer import BaseConsumer, PermanentError

logger = logging.getLogger(__name__)

# Shared in-process queue: (conference_id, wav_segment_path_or_url)
_audio_analysis_queue: asyncio.Queue[tuple[str, str]] = asyncio.Queue(maxsize=500)


def get_audio_analysis_queue() -> asyncio.Queue[tuple[str, str]]:
    """Return the shared analysis queue (AudioRecordingConsumer → AudioAnalysisConsumer)."""
    return _audio_analysis_queue


class AudioFrame:
    """Message type consumed by AudioRecordingConsumer."""

    __slots__ = ("conference_id", "audio_bytes")

    def __init__(self, conference_id: str, audio_bytes: bytes) -> None:
        self.conference_id = conference_id
        self.audio_bytes = audio_bytes  # SECURITY: never log this field


class FinalizeConference:
    """Sentinel message to finalize (close + upload) a conference's capture session."""

    __slots__ = ("conference_id",)

    def __init__(self, conference_id: str) -> None:
        self.conference_id = conference_id


class AudioRecordingConsumer(BaseConsumer):
    """Buffers audio frames per conference and uploads WAV segments to Azure Blob.

    The queue accepts ``AudioFrame`` and ``FinalizeConference`` messages.
    """

    name = "audio_recording_consumer"

    def __init__(self) -> None:
        self._queue: asyncio.Queue[AudioFrame | FinalizeConference] = asyncio.Queue(maxsize=1000)
        self._capture_sessions: dict[str, Any] = {}
        self._failed_sessions: set[str] = set()  # conf_ids where init failed — skip per-frame retries

    @property
    def queue(self) -> asyncio.Queue[AudioFrame | FinalizeConference]:
        """Public inbound queue for producers."""
        return self._queue

    async def _run_loop(self) -> None:
        while True:
            message = await self._queue.get()
            try:
                await self._safe_process(message)
            finally:
                self._queue.task_done()

    async def process(self, message: AudioFrame | FinalizeConference) -> None:
        if isinstance(message, AudioFrame):
            await self._handle_audio_frame(message)
        elif isinstance(message, FinalizeConference):
            await self._handle_finalize(message)
        else:
            raise PermanentError(f"Unknown message type: {type(message)}")

    async def _handle_audio_frame(self, frame: AudioFrame) -> None:
        """Write audio bytes to the conference's capture session.

        SECURITY: frame.audio_bytes is NEVER logged.
        """
        session = self._get_or_create_session(frame.conference_id)
        if session is not None:
            try:
                await asyncio.to_thread(session.write_chunk, frame.audio_bytes)
            except Exception as exc:
                logger.error(
                    "audio_recording: write_chunk failed conf_id=%s — %s",
                    frame.conference_id, type(exc).__name__,
                )

    async def _handle_finalize(self, msg: FinalizeConference) -> None:
        """Close WAV file and upload to Azure Blob."""
        self._failed_sessions.discard(msg.conference_id)
        session = self._capture_sessions.pop(msg.conference_id, None)
        if session is None:
            return
        try:
            url = await session.finalize()
            if url:
                logger.info(
                    "audio_recording: uploaded conf_id=%s", msg.conference_id
                )
                # Signal analysis consumer
                try:
                    _audio_analysis_queue.put_nowait((msg.conference_id, url))
                except asyncio.QueueFull:
                    logger.warning(
                        "audio_recording: analysis queue full, dropping signal for %s",
                        msg.conference_id,
                    )
        except Exception as exc:
            logger.error(
                "audio_recording: finalize failed conf_id=%s — %s",
                msg.conference_id, type(exc).__name__,
            )

    def _get_or_create_session(self, conference_id: str) -> Optional[Any]:
        """Return an AudioCaptureService for *conference_id*, creating one lazily.

        Once init fails for a conference_id, that id is added to _failed_sessions so
        subsequent frames don't retry (and spam logs) on every audio chunk.
        Cleared on FinalizeConference so a new conference reusing the same id gets a
        fresh attempt (unlikely but correct).
        """
        if conference_id in self._capture_sessions:
            return self._capture_sessions[conference_id]
        if conference_id in self._failed_sessions:
            return None
        try:
            from app.platform.settings import get_settings  # noqa: PLC0415
            from app.services.audio.audio_capture import AudioCaptureService  # noqa: PLC0415

            session = AudioCaptureService(conference_id, settings=get_settings())
            if session.enabled:
                self._capture_sessions[conference_id] = session
                return session
            return None
        except Exception as exc:
            logger.error(
                "audio_recording: session init failed conf_id=%s — audio capture disabled for this conference — %s",
                conference_id, exc, exc_info=True,
            )
            self._failed_sessions.add(conference_id)
            return None
