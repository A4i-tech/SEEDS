import io
import os
import wave
import logging
from datetime import datetime
from azure.storage.blob import BlobServiceClient, ContentSettings

logger = logging.getLogger("audio-capture")


class AudioCaptureService:
    """Captures raw audio chunks from the websocket and uploads them as WAV to Azure Blob Storage."""

    INPUT_RATE = 8000
    SAMPLE_WIDTH = 2  # 16-bit
    CHANNELS = 1

    def __init__(self, conference_id: str):
        self.conference_id = conference_id
        self.buffer = bytearray()
        self.enabled = os.getenv("AUDIO_CAPTURE_ENABLED", "false").lower() == "true"
        self.upload_to_azure = os.getenv("AUDIO_CAPTURE_UPLOAD_TO_AZURE", "false").lower() == "true"
        self.container_name = os.getenv("AUDIO_CAPTURE_CONTAINER", "audio-recordings")
        self.blob_prefix = os.getenv("AUDIO_CAPTURE_BLOB_PREFIX", "audio-recording")
        self.start_time = datetime.utcnow()

        if self.enabled and self.upload_to_azure:
            connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING")
            if connection_string:
                self.blob_service_client = BlobServiceClient.from_connection_string(connection_string)
                logger.info(f"AudioCaptureService initialized for conference {conference_id}")
            else:
                logger.error("AZURE_STORAGE_CONNECTION_STRING not set, disabling audio capture upload")
                self.upload_to_azure = False

        if not self.enabled:
            logger.info(f"AudioCaptureService disabled for conference {conference_id}")

    def append_chunk(self, audio_data: bytes):
        if not self.enabled:
            return
        self.buffer.extend(audio_data)

    async def flush_and_upload(self) -> str | None:
        """Convert buffered audio to WAV and upload to Azure. Returns the blob URL or None."""
        if not self.enabled or len(self.buffer) == 0:
            logger.info("No audio data to upload")
            return None

        wav_buffer = self._build_wav()
        blob_name = self._build_blob_name()

        if self.upload_to_azure:
            try:
                container_client = self.blob_service_client.get_container_client(self.container_name)
                # Ensure container exists
                try:
                    container_client.get_container_properties()
                except Exception:
                    container_client.create_container()
                    logger.info(f"Created container: {self.container_name}")

                blob_client = container_client.get_blob_client(blob_name)
                blob_client.upload_blob(
                    wav_buffer,
                    overwrite=True,
                    content_settings=ContentSettings(content_type="audio/wav"),
                )
                logger.info(f"Uploaded recording to {blob_client.url}")
                self.buffer = bytearray()
                return blob_client.url
            except Exception as e:
                logger.error(f"Failed to upload recording to Azure: {e}")
                return None
        else:
            logger.info(f"Azure upload disabled, discarding {len(self.buffer)} bytes of audio")
            self.buffer = bytearray()
            return None

    def _build_wav(self) -> bytes:
        wav_io = io.BytesIO()
        with wave.open(wav_io, "wb") as wf:
            wf.setnchannels(self.CHANNELS)
            wf.setsampwidth(self.SAMPLE_WIDTH)
            wf.setframerate(self.INPUT_RATE)
            wf.writeframes(bytes(self.buffer))
        return wav_io.getvalue()

    def _build_blob_name(self) -> str:
        date_path = self.start_time.strftime("%Y/%m/%d")
        timestamp = self.start_time.strftime("%H%M%S")
        return f"{date_path}/{self.conference_id}_{timestamp}.wav"
