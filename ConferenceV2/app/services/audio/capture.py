import os
from datetime import datetime
from typing import Optional
from azure.storage.blob.aio import BlobServiceClient
from azure.core.exceptions import ResourceExistsError


class AudioCaptureSession:
    def __init__(self, conference_id: str):
        self.conference_id = conference_id
        capture_dir = os.getenv("AUDIO_CAPTURE_DIR", "/tmp/conference-audio-capture")
        os.makedirs(capture_dir, exist_ok=True)
        ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
        self.file_path = os.path.join(capture_dir, f"{conference_id}-{ts}.pcm")
        self._file = open(self.file_path, "ab")
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
            self._file.write(audio_bytes[:remaining])
            self.total_bytes += remaining
            self._file.flush()
            self.truncated = True
            return
        self._file.write(audio_bytes)
        self._file.flush()
        self.total_bytes += len(audio_bytes)

    def close(self) -> None:
        if self._file and not self._file.closed:
            self._file.close()

    async def upload_to_azure(self) -> Optional[str]:
        if os.getenv("AUDIO_CAPTURE_UPLOAD_TO_AZURE", "false").lower() != "true":
            return None

        connection_string = os.getenv("AZURE_STORAGE_CONNECTION_STRING", "")
        if not connection_string:
            return None

        container_name = os.getenv("AUDIO_CAPTURE_CONTAINER", "conference-audio-debug")
        ts_dir = datetime.utcnow().strftime("%Y/%m/%d")
        blob_name = f"{ts_dir}/{os.path.basename(self.file_path)}"

        service_client = BlobServiceClient.from_connection_string(connection_string)
        container_client = service_client.get_container_client(container_name)
        try:
            await container_client.create_container()
        except ResourceExistsError:
            pass
        blob_client = container_client.get_blob_client(blob_name)

        with open(self.file_path, "rb") as f:
            await blob_client.upload_blob(
                f,
                overwrite=True,
                metadata={
                    "conference_id": self.conference_id,
                    "captured_bytes": str(self.total_bytes),
                    "truncated": str(self.truncated).lower(),
                },
            )
        await service_client.close()
        return blob_client.url

    async def finalize(self) -> Optional[str]:
        self.close()
        uploaded_url = await self.upload_to_azure()
        delete_local = os.getenv("AUDIO_CAPTURE_DELETE_LOCAL_AFTER_UPLOAD", "false").lower() == "true"
        if delete_local and uploaded_url and os.path.exists(self.file_path):
            os.remove(self.file_path)
        return uploaded_url
