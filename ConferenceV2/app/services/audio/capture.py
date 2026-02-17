import os
from datetime import datetime, timezone
import re
from typing import Optional
import wave
from azure.storage.blob.aio import BlobServiceClient
from azure.core.exceptions import ResourceExistsError
from azure.storage.blob import ContentSettings
from app.conf_logger import logger_instance as logger


class AudioCaptureSession:
    def __init__(self, conference_id: str):
        self.conference_id = conference_id
        self.safe_conf_id = re.sub(r"[^A-Za-z0-9_.-]+", "_", conference_id)
        capture_dir = os.getenv("AUDIO_CAPTURE_DIR", "/tmp/conference-audio-capture")
        os.makedirs(capture_dir, exist_ok=True)
        self.capture_started_at_utc = datetime.now(timezone.utc)
        self.capture_start_ts = self.capture_started_at_utc.strftime("%Y%m%dT%H%M%SZ")
        self.format = os.getenv("AUDIO_CAPTURE_FORMAT", "pcm").strip().lower()
        if self.format not in {"pcm", "wav"}:
            self.format = "pcm"
        ext = "wav" if self.format == "wav" else "pcm"
        self.file_path = os.path.join(capture_dir, f"{self.safe_conf_id}-{self.capture_start_ts}.{ext}")
        self._file = open(self.file_path, "wb")
        try:
            os.chmod(self.file_path, 0o600)
        except OSError:
            pass

        self.sample_rate_hz = int(os.getenv("AUDIO_CAPTURE_SAMPLE_RATE_HZ", "8000"))
        self.channels = int(os.getenv("AUDIO_CAPTURE_CHANNELS", "1"))
        self.sample_width_bytes = int(os.getenv("AUDIO_CAPTURE_SAMPLE_WIDTH_BYTES", "2"))
        self.flush_every_bytes = int(os.getenv("AUDIO_CAPTURE_FLUSH_EVERY_BYTES", "32768"))
        self._unflushed_bytes = 0
        self._wave_writer: Optional[wave.Wave_write] = None
        if self.format == "wav":
            self._wave_writer = wave.open(self._file, "wb")
            self._wave_writer.setnchannels(self.channels)
            self._wave_writer.setsampwidth(self.sample_width_bytes)
            self._wave_writer.setframerate(self.sample_rate_hz)

        self.total_bytes = 0
        self.max_bytes = int(os.getenv("AUDIO_CAPTURE_MAX_BYTES", str(100 * 1024 * 1024)))
        self.truncated = False

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
        if os.getenv("AUDIO_CAPTURE_UPLOAD_TO_AZURE", "false").lower() != "true":
            return None

        connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
        if not connection_string:
            return None

        container_name = os.getenv("AUDIO_CAPTURE_CONTAINER", "seedsstagingblob")
        blob_prefix = os.getenv("AUDIO_CAPTURE_BLOB_PREFIX", "audio-recording").strip("/")
        ext = "wav" if self.format == "wav" else "pcm"
        capture_end_ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        blob_filename = f"{self.safe_conf_id}-{self.capture_start_ts}-{capture_end_ts}.{ext}"
        blob_name = (
            f"{blob_prefix}/{blob_filename}"
            if blob_prefix
            else blob_filename
        )

        service_client = BlobServiceClient.from_connection_string(connection_string)
        try:
            container_client = service_client.get_container_client(container_name)
            try:
                await container_client.create_container()
            except ResourceExistsError:
                pass
            blob_client = container_client.get_blob_client(blob_name)

            content_type = "audio/wav" if self.format == "wav" else "audio/L16"
            with open(self.file_path, "rb") as f:
                await blob_client.upload_blob(
                    f,
                    overwrite=True,
                    content_settings=ContentSettings(content_type=content_type),
                    metadata={
                        "conference_id": self.conference_id,
                        "captured_bytes": str(self.total_bytes),
                        "truncated": str(self.truncated).lower(),
                        "capture_start_utc": self.capture_start_ts,
                        "capture_end_utc": capture_end_ts,
                        "audio_format": self.format,
                        "sample_rate_hz": str(self.sample_rate_hz),
                        "channels": str(self.channels),
                        "sample_width_bytes": str(self.sample_width_bytes),
                    },
                )
            return blob_client.url
        except Exception as exc:
            logger.exception("Failed to upload captured audio to Azure: %s", exc)
            return None
        finally:
            await service_client.close()

    async def finalize(self) -> Optional[str]:
        try:
            self.close()
            uploaded_url = await self.upload_to_azure()
            delete_local = os.getenv("AUDIO_CAPTURE_DELETE_LOCAL_AFTER_UPLOAD", "false").lower() == "true"
            if delete_local and uploaded_url and os.path.exists(self.file_path):
                os.remove(self.file_path)
            return uploaded_url
        except Exception as exc:
            logger.exception("Failed to finalize audio capture: %s", exc)
            return None
