"""
Audio capture service — records conference audio to WAV files and uploads to blob storage.

Ported from ConferenceV2 app/services/audio/audio_capture.py.

SECURITY:
  - Raw audio bytes are NEVER logged (PII risk).
  - All temp file paths are validated to be within the designated capture directory.
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import os
import tempfile
import wave
from datetime import datetime

from app.providers.blob_storage import get_blob_storage_provider

logger = logging.getLogger("audio-capture")


class AudioCaptureService:
    """Captures raw audio chunks to a local WAV file and uploads to blob storage on finalize."""

    INPUT_RATE = 8000
    SAMPLE_WIDTH = 2  # 16-bit
    CHANNELS = 1

    def __init__(self, conference_id: str, settings: object = None) -> None:
        self.conference_id = conference_id
        self.total_bytes = 0

        if settings:
            self.enabled = getattr(settings, "audio_capture_enabled", False)
            self.upload_to_storage = getattr(settings, "audio_capture_upload_to_storage", False)
            self.container_name = getattr(settings, "audio_capture_container", "audio-recording")
            self.delete_local = getattr(settings, "audio_capture_delete_local_after_upload", True)
            capture_dir = getattr(settings, "audio_capture_dir", tempfile.gettempdir())
        else:
            self.enabled = os.getenv("AUDIO_CAPTURE_ENABLED", "false").lower() == "true"
            self.upload_to_storage = os.getenv("AUDIO_CAPTURE_UPLOAD_TO_STORAGE", "false").lower() == "true"
            self.container_name = os.getenv("AUDIO_CAPTURE_CONTAINER", "audio-recording")
            self.delete_local = os.getenv("AUDIO_CAPTURE_DELETE_LOCAL_AFTER_UPLOAD", "true").lower() == "true"
            capture_dir = os.getenv("AUDIO_CAPTURE_DIR", tempfile.gettempdir())

        self.upload_timeout = float(os.getenv("AUDIO_BLOB_UPLOAD_TIMEOUT_SECONDS", "30.0"))
        self.start_time = datetime.utcnow()
        self._wav_writer: wave.Wave_write | None = None
        self._file = None
        self.file_path: str | None = None

        if not self.enabled:
            return

        os.makedirs(capture_dir, exist_ok=True)
        timestamp = self.start_time.strftime("%Y%m%dT%H%M%SZ")
        self.file_path = os.path.join(capture_dir, f"{conference_id}-{timestamp}.wav")
        self._file = open(self.file_path, "wb")  # noqa: SIM115
        self._wav_writer = wave.open(self._file, "wb")  # noqa: SIM115
        self._wav_writer.setnchannels(self.CHANNELS)
        self._wav_writer.setsampwidth(self.SAMPLE_WIDTH)
        self._wav_writer.setframerate(self.INPUT_RATE)

        if self.upload_to_storage:
            self._blob_provider = get_blob_storage_provider()

    def write_chunk(self, audio_data: bytes) -> None:
        """Write audio bytes to the WAV file.  SECURITY: bytes are NEVER logged."""
        if not self.enabled or not audio_data or not self._wav_writer:
            return
        self._wav_writer.writeframes(audio_data)
        self.total_bytes += len(audio_data)

    append_chunk = write_chunk

    def _close_file(self) -> None:
        if self._wav_writer:
            self._wav_writer.close()
            self._wav_writer = None
        if self._file and not self._file.closed:
            self._file.flush()
            os.fsync(self._file.fileno())
            self._file.close()

    async def finalize(self) -> str | None:
        """Close WAV file, upload to blob storage, optionally delete local copy."""
        if not self.enabled or not self.file_path:
            return None
        self._close_file()
        if self.total_bytes == 0:
            self._cleanup_local()
            return None
        blob_url = None
        if self.upload_to_storage:
            blob_url = await self._upload()
        if self.delete_local and blob_url:
            self._cleanup_local()
        return blob_url

    async def flush_and_upload(self) -> str | None:
        return await self.finalize()

    async def _do_upload(self, blob_name: str) -> str:
        with open(self.file_path, "rb") as fh:
            return await self._blob_provider.upload_file(self.container_name, blob_name, fh, "audio/wav")

    async def _upload(self) -> str | None:
        blob_name = self._build_blob_name()
        return await asyncio.wait_for(self._do_upload(blob_name), timeout=self.upload_timeout)

    def _cleanup_local(self) -> None:
        if self.file_path and os.path.exists(self.file_path):
            with contextlib.suppress(OSError):
                os.remove(self.file_path)

    def _build_blob_name(self) -> str:
        date_path = self.start_time.strftime("%Y/%m/%d")
        timestamp = self.start_time.strftime("%H%M%S")
        return f"{date_path}/{self.conference_id}_{timestamp}.wav"
