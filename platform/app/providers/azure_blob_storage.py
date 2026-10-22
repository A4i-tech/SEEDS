"""
Azure Blob Storage provider (STORAGE_BACKEND=azure).

Ported from backend-server/src/services/BlobService.js.

Needs the optional ``azure`` extra (azure-storage-blob). Import this module only
from ``get_blob_storage_provider()`` so the platform starts without that package.

SECURITY:
  - SAS tokens are NEVER logged.
  - Connection string / account key are never returned to callers.
  - Short expiry defaults (1 hour) to minimise token exposure window.

``AzureBlobStorageProvider`` uses the ``azure.storage.blob.aio`` async client so
upload/download/delete/user-delegation-key calls never block the event loop
(see A4i-tech/.github#430). ``generate_sas_url_sync`` uses the synchronous
``azure.storage.blob`` client because it is called from the non-async Vonage
NCCO-building code path (``SASGenerator``).
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from typing import IO

from azure.storage.blob import (
    BlobSasPermissions,
    ContentSettings,
    generate_blob_sas,
)
from azure.storage.blob.aio import BlobServiceClient, ContainerClient

from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider

logger = logging.getLogger(__name__)


class AzureBlobStorageProvider(BlobStorageProvider):
    """Async-capable wrapper around Azure Blob Service Client.

    Initialises credentials from settings in priority order:
      1. azure_storage_connection_string
      2. azure_storage_account_name + azure_storage_account_key  (shared-key SAS)
      3. DefaultAzureCredential  (managed identity / user delegation SAS)
    """

    def __init__(self) -> None:
        self._client = BlobServiceClient.from_connection_string(get_settings().azure_storage_connection_string)

    # ------------------------------------------------------------------
    # Container helpers
    # ------------------------------------------------------------------

    def get_container_client(self, container: str) -> ContainerClient:
        """Return a ContainerClient for *container*."""
        return self._client.get_container_client(container)

    def blob_url(self, container: str, blob_name: str) -> str:
        container_client = self._client.get_container_client(container)
        if not blob_name:
            return f"{container_client.url}/"
        return container_client.get_blob_client(blob_name).url

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    async def upload_file(
        self,
        container: str,
        blob_name: str,
        data: bytes | IO[bytes],
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload *data* to *container*/*blob_name* and return the blob URL.

        *data* may be raw bytes or a readable binary stream — the Azure SDK
        streams a file-like object in chunks rather than buffering it whole.

        Raises on failure; caller is responsible for cleanup.
        """
        container_client = self._client.get_container_client(container)
        blob_client = container_client.get_blob_client(blob_name)
        await blob_client.upload_blob(
            data,
            overwrite=True,
            content_settings=ContentSettings(content_type=content_type),
        )
        url: str = blob_client.url
        logger.info("blob_storage: uploaded blob container=%s name=%s", container, blob_name)
        return url

    async def download_file(self, container: str, blob_name: str) -> bytes:
        """Download blob *blob_name* from *container* and return raw bytes."""
        container_client = self._client.get_container_client(container)
        blob_client = container_client.get_blob_client(blob_name)
        stream = await blob_client.download_blob()
        data: bytes = await stream.readall()
        logger.debug("blob_storage: downloaded blob container=%s name=%s size=%d", container, blob_name, len(data))
        return data

    async def exists(self, container: str, blob_name: str) -> bool:
        """Return True if *blob_name* already exists in *container*."""
        container_client = self._client.get_container_client(container)
        blob_client = container_client.get_blob_client(blob_name)
        return await blob_client.exists()

    async def delete_blob(self, container: str, blob_name: str) -> bool:
        """Delete blob *blob_name* from *container*.

        Returns True if deleted, False if not found.
        """
        container_client = self._client.get_container_client(container)
        blob_client = container_client.get_blob_client(blob_name)
        await blob_client.delete_blob(delete_snapshots="include")
        logger.info("blob_storage: deleted blob container=%s name=%s", container, blob_name)
        return True

    def _signed_url(
        self,
        container: str,
        blob_name: str,
        start: datetime,
        expiry: datetime,
        permissions: BlobSasPermissions,
    ) -> str:
        sas_token = generate_blob_sas(
            account_name=self._client.account_name,
            container_name=container,
            blob_name=blob_name,
            account_key=self._client.credential.account_key,
            permission=permissions,
            expiry=expiry,
            start=start,
        )
        return f"{self.blob_url(container, blob_name)}?{sas_token}"

    async def generate_sas_url(
        self,
        container: str,
        blob_name: str,
        expiry_hours: int = 1,
        read: bool = True,
        write: bool = False,
    ) -> str:
        """Return a SAS URL for *container*/*blob_name*.

        SECURITY: SAS token string is never logged.
        """
        now = datetime.now(UTC)
        start = now - timedelta(minutes=5)   # small clock-skew buffer
        expiry = now + timedelta(hours=expiry_hours)

        permissions = BlobSasPermissions(read=read, write=write)

        url = self._signed_url(container, blob_name, start, expiry, permissions)

        # Intentionally NOT logging the full URL with token attached
        logger.info("blob_storage: generated SAS url container=%s name=%s expiry_hours=%d", container, blob_name, expiry_hours)
        return url

    def generate_sas_url_sync(self, container: str, blob_name: str, expiry_hours: int = 1) -> str:
        now = datetime.now(UTC)
        start = now - timedelta(minutes=5)
        expiry = now + timedelta(hours=expiry_hours)
        permissions = BlobSasPermissions(read=True)

        return self._signed_url(container, blob_name, start, expiry, permissions)
