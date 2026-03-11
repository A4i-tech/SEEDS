import os
from datetime import datetime, timezone
import re
from typing import Optional
import wave
from app.conf_logger import logger_instance as logger
from app.services.audio.capture_uploader import AzureAudioCaptureUploader
from config import Settings, get_settings


class AudioCaptureSession:
    def __init__(
        self,
        conference_id: str,
        uploader: Optional[AzureAudioCaptureUploader] = None,
        settings: Optional[Settings] = None,
    ):
        self.settings = settings or get_settings()
        self.conference_id = conference_id
        self.safe_conf_id = re.sub(r"[^A-Za-z0-9_.-]+", "_", conference_id)
        capture_dir = self.settings.AUDIO_CAPTURE_DIR
        os.makedirs(capture_dir, exist_ok=True)
        self.capture_started_at_utc = datetime.now(timezone.utc)
        self.capture_start_ts = self.capture_started_at_utc.strftime("%Y%m%dT%H%M%SZ")
        self.format = self.settings.AUDIO_CAPTURE_FORMAT.strip().lower()
        if self.format not in {"pcm", "wav"}:
            self.format = "pcm"
        ext = "wav" if self.format == "wav" else "pcm"
        self.file_path = os.path.join(capture_dir, f"{self.safe_conf_id}-{self.capture_start_ts}.{ext}")
        self._file = open(self.file_path, "wb")
        try:
            os.chmod(self.file_path, 0o600)
        except OSError:
            pass

        self.sample_rate_hz = self.settings.AUDIO_CAPTURE_SAMPLE_RATE_HZ
        self.channels = self.settings.AUDIO_CAPTURE_CHANNELS
        self.sample_width_bytes = self.settings.AUDIO_CAPTURE_SAMPLE_WIDTH_BYTES
        self.flush_every_bytes = self.settings.AUDIO_CAPTURE_FLUSH_EVERY_BYTES
        self._unflushed_bytes = 0
        self._wave_writer: Optional[wave.Wave_write] = None
        if self.format == "wav":
            self._wave_writer = wave.open(self._file, "wb")
            self._wave_writer.setnchannels(self.channels)
            self._wave_writer.setsampwidth(self.sample_width_bytes)
            self._wave_writer.setframerate(self.sample_rate_hz)

        self.total_bytes = 0
        self.max_bytes = self.settings.AUDIO_CAPTURE_MAX_BYTES
        self.truncated = False
        self.uploader = uploader or AzureAudioCaptureUploader.from_settings(self.settings)

    def write_chunk(self, audio_bytes: bytes) -> None:
        if not audio_bytes:
            return
        remaining = self.max_bytes - self.total_bytes
        if remaining <= 0:
            self.truncated = True
            return
        if len(audio_bytes) > remaining:
            self._write_bytes(audio_bytes[:remaining])
            self.total_bytes += remaining
            self.truncated = True
            return
        self._write_bytes(audio_bytes)
        self.total_bytes += len(audio_bytes)

    def _write_bytes(self, audio_bytes: bytes) -> None:
        if not audio_bytes:
            return
        if self._wave_writer:
            self._wave_writer.writeframes(audio_bytes)
        else:
            self._file.write(audio_bytes)

        self._unflushed_bytes += len(audio_bytes)
        if self._unflushed_bytes >= self.flush_every_bytes:
            self._file.flush()
            self._unflushed_bytes = 0

    def close(self) -> None:
        if self._wave_writer:
            self._wave_writer.close()
            self._wave_writer = None
        if self._file and not self._file.closed:
            self._file.flush()
            self._file.close()

    async def upload_to_azure(self) -> Optional[str]:
        return await self.uploader.upload(
            local_file_path=self.file_path,
            safe_conf_id=self.safe_conf_id,
            capture_start_ts=self.capture_start_ts,
            audio_format=self.format,
            metadata={
                "conference_id": self.conference_id,
                "captured_bytes": str(self.total_bytes),
                "truncated": str(self.truncated).lower(),
                "capture_start_utc": self.capture_start_ts,
                "audio_format": self.format,
                "sample_rate_hz": str(self.sample_rate_hz),
                "channels": str(self.channels),
                "sample_width_bytes": str(self.sample_width_bytes),
            },
        )

    async def finalize(self) -> Optional[str]:
        try:
            self.close()
            uploaded_url = await self.upload_to_azure()
            delete_local = self.settings.AUDIO_CAPTURE_DELETE_LOCAL_AFTER_UPLOAD
            if delete_local and uploaded_url and os.path.exists(self.file_path):
                os.remove(self.file_path)
            return uploaded_url
        except Exception as exc:
            logger.exception("Failed to finalize audio capture: %s", exc)
            return None
