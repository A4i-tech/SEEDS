from datetime import datetime, timezone
from typing import Optional

from azure.core.exceptions import ResourceExistsError
from azure.storage.blob import ContentSettings
from azure.storage.blob.aio import BlobServiceClient

from app.conf_logger import logger_instance as logger
from config import Settings, get_settings


class AzureAudioCaptureUploader:
    def __init__(
        self,
        connection_string: str,
        container_name: str,
        blob_prefix: str,
        enabled: bool,
    ) -> None:
        self.connection_string = connection_string
        self.container_name = container_name
        self.blob_prefix = blob_prefix.strip("/")
        self.enabled = enabled

    @classmethod
    def from_settings(cls, settings: Settings) -> "AzureAudioCaptureUploader":
        return cls(
            connection_string=settings.AZURE_STORAGE_CONNECTION_STRING,
            container_name=settings.AUDIO_CAPTURE_CONTAINER,
            blob_prefix=settings.AUDIO_CAPTURE_BLOB_PREFIX,
            enabled=settings.AUDIO_CAPTURE_UPLOAD_TO_AZURE,
        )

    @classmethod
    def from_env(cls) -> "AzureAudioCaptureUploader":
        return cls.from_settings(get_settings())

    async def upload(
        self,
        local_file_path: str,
        safe_conf_id: str,
        capture_start_ts: str,
        audio_format: str,
        metadata: dict[str, str],
    ) -> Optional[str]:
        if not self.enabled or not self.connection_string:
            return None

        ext = "wav" if audio_format == "wav" else "pcm"
        capture_end_ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
        blob_filename = f"{safe_conf_id}-{capture_start_ts}-{capture_end_ts}.{ext}"
        blob_name = f"{self.blob_prefix}/{blob_filename}" if self.blob_prefix else blob_filename

        service_client = BlobServiceClient.from_connection_string(self.connection_string)
        try:
            container_client = service_client.get_container_client(self.container_name)
            try:
                await container_client.create_container()
            except ResourceExistsError:
                pass

            blob_client = container_client.get_blob_client(blob_name)
            content_type = "audio/wav" if audio_format == "wav" else "audio/L16"

            with open(local_file_path, "rb") as f:
                await blob_client.upload_blob(
                    f,
                    overwrite=True,
                    content_settings=ContentSettings(content_type=content_type),
                    metadata=metadata,
                )
            return blob_client.url
        except Exception as exc:
            logger.exception("Failed to upload captured audio to Azure: %s", exc)
            return None
        finally:
            await service_client.close()
