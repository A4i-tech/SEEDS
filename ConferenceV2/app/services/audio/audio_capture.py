import asyncio
import io
import os
import wave
import logging
import tempfile
from datetime import datetime
from typing import Optional
from azure.storage.blob import BlobServiceClient, ContentSettings

logger = logging.getLogger("audio-capture")


class AudioCaptureService:
    """Captures raw audio chunks to a local WAV file and uploads to Azure Blob Storage on finalize."""

    INPUT_RATE = 8000
    SAMPLE_WIDTH = 2  # 16-bit
    CHANNELS = 1

    def __init__(self, conference_id: str, settings=None):
        self.conference_id = conference_id
        self.total_bytes = 0

        if settings:
            self.enabled = settings.AUDIO_CAPTURE_ENABLED
            self.upload_to_azure = settings.AUDIO_CAPTURE_UPLOAD_TO_AZURE
            self.container_name = settings.AUDIO_CAPTURE_CONTAINER
            self.delete_local = getattr(settings, "AUDIO_CAPTURE_DELETE_LOCAL_AFTER_UPLOAD", True)
            connection_string = settings.AZURE_STORAGE_CONNECTION_STRING
            capture_dir = getattr(settings, "AUDIO_CAPTURE_DIR", tempfile.gettempdir())
        else:
            self.enabled = os.getenv("AUDIO_CAPTURE_ENABLED", "false").lower() == "true"
            self.upload_to_azure = os.getenv("AUDIO_CAPTURE_UPLOAD_TO_AZURE", "false").lower() == "true"
            self.container_name = os.getenv("AUDIO_CAPTURE_CONTAINER", "audio-recording")
            self.delete_local = os.getenv("AUDIO_CAPTURE_DELETE_LOCAL_AFTER_UPLOAD", "true").lower() == "true"
            connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
            capture_dir = os.getenv("AUDIO_CAPTURE_DIR", tempfile.gettempdir())

        self.upload_timeout = float(os.getenv("AUDIO_BLOB_UPLOAD_TIMEOUT_SECONDS", "30.0"))
        self.upload_max_retries = int(os.getenv("AUDIO_BLOB_UPLOAD_MAX_RETRIES", "3"))
        self.start_time = datetime.utcnow()
        self.blob_service_client = None
        self._wav_writer: Optional[wave.Wave_write] = None
        self._file = None
        self.file_path = None

        if not self.enabled:
            logger.info(f"AudioCaptureService disabled for conference {conference_id}")
            return

        # Set up local WAV file for streaming writes
        os.makedirs(capture_dir, exist_ok=True)
        timestamp = self.start_time.strftime("%Y%m%dT%H%M%SZ")
        self.file_path = os.path.join(capture_dir, f"{conference_id}-{timestamp}.wav")
        self._file = open(self.file_path, "wb")
        self._wav_writer = wave.open(self._file, "wb")
        self._wav_writer.setnchannels(self.CHANNELS)
        self._wav_writer.setsampwidth(self.SAMPLE_WIDTH)
        self._wav_writer.setframerate(self.INPUT_RATE)

        if self.upload_to_azure:
            if connection_string:
                self.blob_service_client = BlobServiceClient.from_connection_string(connection_string)
                logger.info(f"AudioCaptureService initialized for conference {conference_id}")
            else:
                logger.error("AZURE_STORAGE_CONNECTION_STRING not set, disabling upload")
                self.upload_to_azure = False

    def write_chunk(self, audio_data: bytes):
        """Write audio data directly to the local WAV file."""
        if not self.enabled or not audio_data or not self._wav_writer:
            return
        self._wav_writer.writeframes(audio_data)
        self.total_bytes += len(audio_data)

    # Alias
    append_chunk = write_chunk

    def _close_file(self):
        """Close the WAV writer and underlying file, ensuring data is flushed to disk."""
        if self._wav_writer:
            self._wav_writer.close()
            self._wav_writer = None
        if self._file and not self._file.closed:
            self._file.flush()
            os.fsync(self._file.fileno())
            self._file.close()

    async def finalize(self) -> Optional[str]:
        """Close local file, upload to Azure, and optionally delete local copy."""
        if not self.enabled or not self.file_path:
            return None

        self._close_file()

        if self.total_bytes == 0:
            logger.info("No audio data captured, skipping upload")
            self._cleanup_local()
            return None

        blob_url = None
        if self.upload_to_azure and self.blob_service_client:
            blob_url = await self._upload_to_azure()

        if self.delete_local and blob_url:
            self._cleanup_local()

        return blob_url

    # Keep backward compat
    async def flush_and_upload(self) -> Optional[str]:
        return await self.finalize()

    def _do_upload(self, blob_name: str) -> str:
        """Synchronous upload to Azure Blob Storage (runs in a thread)."""
        container_client = self.blob_service_client.get_container_client(self.container_name)
        try:
            container_client.get_container_properties()
        except Exception:
            container_client.create_container()
            logger.info(f"Created container: {self.container_name}")

        blob_client = container_client.get_blob_client(blob_name)
        with open(self.file_path, "rb") as f:
            blob_client.upload_blob(
                f,
                overwrite=True,
                content_settings=ContentSettings(content_type="audio/wav"),
            )
        return blob_client.url

    async def _upload_to_azure(self) -> Optional[str]:
        blob_name = self._build_blob_name()
        last_error = None
        for attempt in range(1, self.upload_max_retries + 1):
            try:
                url = await asyncio.wait_for(
                    asyncio.to_thread(self._do_upload, blob_name),
                    timeout=self.upload_timeout,
                )
                logger.info(f"Uploaded recording to {url}")
                return url
            except asyncio.TimeoutError:
                last_error = "timeout"
                logger.warning(
                    "Azure upload attempt %s/%s timed out after %.0fs",
                    attempt, self.upload_max_retries, self.upload_timeout,
                )
            except Exception as e:
                last_error = e
                logger.warning(
                    "Azure upload attempt %s/%s failed: %s",
                    attempt, self.upload_max_retries, e,
                )
            if attempt < self.upload_max_retries:
                await asyncio.sleep(min(1.0 * 2 ** (attempt - 1), 8.0))
        logger.error(f"Failed to upload recording to Azure after {self.upload_max_retries} attempts: {last_error}")
        return None

    def _cleanup_local(self):
        if self.file_path and os.path.exists(self.file_path):
            try:
                os.remove(self.file_path)
            except OSError:
                pass

    def _build_blob_name(self) -> str:
        date_path = self.start_time.strftime("%Y/%m/%d")
        timestamp = self.start_time.strftime("%H%M%S")
        return f"{date_path}/{self.conference_id}_{timestamp}.wav"
