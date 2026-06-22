"""
Azure Blob Storage provider.

Ported from backend-server/src/services/BlobService.js.

SECURITY:
  - SAS tokens are NEVER logged.
  - Connection string / account key are never returned to callers.
  - Short expiry defaults (1 hour) to minimise token exposure window.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from azure.identity import DefaultAzureCredential
from urllib.parse import unquote, urlparse

from azure.storage.blob import (
    BlobSasPermissions,
    BlobServiceClient,
    ContentSettings,
    ContainerClient,
    generate_blob_sas,
)

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)


class BlobStorageProvider:
    """Async-capable wrapper around Azure Blob Service Client.

    Initialises credentials from settings in priority order:
      1. azure_storage_connection_string
      2. azure_storage_account_name + azure_storage_account_key  (shared-key SAS)
      3. DefaultAzureCredential  (managed identity / user delegation SAS)
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._account_name: str = settings.azure_storage_account_name
        self._account_key: Optional[str] = settings.azure_storage_account_key or None
        self._use_shared_key: bool = bool(self._account_key)

        conn_str = settings.azure_storage_connection_string
        if conn_str:
            self._client = BlobServiceClient.from_connection_string(conn_str)
        elif self._account_name and self._account_key:
            self._client = BlobServiceClient(
                account_url=f"https://{self._account_name}.blob.core.windows.net",
                credential=self._account_key,
            )
        else:
            credential = DefaultAzureCredential()
            self._use_shared_key = False
            self._client = BlobServiceClient(
                account_url=f"https://{self._account_name}.blob.core.windows.net",
                credential=credential,
            )

    # ------------------------------------------------------------------
    # Container helpers
    # ------------------------------------------------------------------

    def get_container_client(self, container: str) -> ContainerClient:
        """Return a ContainerClient for *container*."""
        return self._client.get_container_client(container)

    # ------------------------------------------------------------------
    # Core operations
    # ------------------------------------------------------------------

    async def upload_file(
        self,
        container: str,
        blob_name: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Upload *data* to *container*/*blob_name* and return the blob URL.

        Raises on failure; caller is responsible for cleanup.
        """
        container_client = self._client.get_container_client(container)
        blob_client = container_client.get_blob_client(blob_name)
        blob_client.upload_blob(
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
        stream = blob_client.download_blob()
        data: bytes = stream.readall()
        logger.debug("blob_storage: downloaded blob container=%s name=%s size=%d", container, blob_name, len(data))
        return data

    async def download_from_url(self, blob_url: str) -> bytes:
        """Download a blob given its full Azure URL and return raw bytes."""
        container, blob_path = _parse_blob_url(blob_url)
        return await self.download_file(container, blob_path)

    async def delete_blob(self, container: str, blob_name: str) -> bool:
        """Delete blob *blob_name* from *container*.

        Returns True if deleted, False if not found.
        """
        try:
            container_client = self._client.get_container_client(container)
            blob_client = container_client.get_blob_client(blob_name)
            blob_client.delete_blob(delete_snapshots="include")
            logger.info("blob_storage: deleted blob container=%s name=%s", container, blob_name)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("blob_storage: delete failed container=%s name=%s — %s", container, blob_name, exc)
            return False

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
        now = datetime.now(timezone.utc)
        start = now - timedelta(minutes=5)   # small clock-skew buffer
        expiry = now + timedelta(hours=expiry_hours)

        permissions = BlobSasPermissions(read=read, write=write)

        if self._use_shared_key and self._account_key:
            sas_token = generate_blob_sas(
                account_name=self._account_name,
                container_name=container,
                blob_name=blob_name,
                account_key=self._account_key,
                permission=permissions,
                expiry=expiry,
                start=start,
            )
        else:
            # User delegation SAS via managed identity
            user_delegation_key = self._client.get_user_delegation_key(start, expiry)
            sas_token = generate_blob_sas(
                account_name=self._account_name,
                container_name=container,
                blob_name=blob_name,
                user_delegation_key=user_delegation_key,
                permission=permissions,
                expiry=expiry,
                start=start,
            )

        blob_url = (
            f"https://{self._account_name}.blob.core.windows.net"
            f"/{container}/{blob_name}"
        )
        # Intentionally NOT logging the full URL with token attached
        logger.info("blob_storage: generated SAS url container=%s name=%s expiry_hours=%d", container, blob_name, expiry_hours)
        return f"{blob_url}?{sas_token}"

    async def get_sas_url_from_blob_url(self, blob_url: str, expiry_hours: int = 1) -> str:
        """Given a full Azure Blob URL, return a new read-only SAS URL.

        Mirrors BlobService.getURLWithSAS from the JS implementation.
        """
        container, blob_path = _parse_blob_url(blob_url)
        return await self.generate_sas_url(container, blob_path, expiry_hours=expiry_hours)

    async def get_upload_sas_url(
        self,
        container: str,
        blob_name: str,
        expiry_hours: int = 1,
    ) -> str:
        """Return a read-write SAS URL for direct client upload.

        Mirrors BlobService.getUploadSASToken from the JS implementation.
        """
        return await self.generate_sas_url(
            container, blob_name, expiry_hours=expiry_hours, read=True, write=True
        )

    def extract_blob_path_without_extension(self, blob_url: str) -> str:
        """Extract blob path (after container) without file extension.

        Mirrors BlobService.extractBlobPathWithoutExtension.
        """
        _container, blob_path = _parse_blob_url(blob_url)
        # Strip last extension
        dot_pos = blob_path.rfind(".")
        if dot_pos > 0:
            return blob_path[:dot_pos]
        return blob_path


# ---------------------------------------------------------------------------
# SASGenerator — synchronous wrapper used by VonageStreamAction.get()
# ---------------------------------------------------------------------------


class SASGenerator:
    """Synchronous SAS URL generator for use in Vonage action get() calls.

    Mirrors IVRv2/app/utils/sas_gen.py SASGen.get_url_with_sas().
    Falls back to returning the original URL when Azure storage is disabled.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._account_name: str = (
            settings.storage_account_name or settings.azure_storage_account_name
        )
        self._account_key: Optional[str] = (
            settings.accountkey or settings.azure_storage_account_key or None
        )
        self._azure_enabled: bool = settings.azure_blob_sas_enabled
        self._sas_expiry_hours: int = 1
        self._use_account_key: bool = bool(self._account_name and self._account_key)

    def get_url_with_sas(self, url: str) -> str:  # noqa: C901
        """Return *url* with a read SAS token appended, or the original URL on error."""
        if not self._azure_enabled:
            return url
        try:
            decoded_url = unquote(url)
            parsed = urlparse(decoded_url)
            parts = [p for p in parsed.path.split("/") if p]
            if len(parts) < 2:
                return url
            container_name = parts[0]
            blob_path = "/".join(parts[1:])

            expiry = datetime.now(timezone.utc) + timedelta(hours=self._sas_expiry_hours)
            start = datetime.now(timezone.utc) - timedelta(minutes=5)

            if self._use_account_key:
                sas_token = generate_blob_sas(
                    account_name=self._account_name,
                    container_name=container_name,
                    blob_name=blob_path,
                    account_key=self._account_key,
                    permission=BlobSasPermissions(read=True),
                    expiry=expiry,
                    start=start,
                )
            else:
                client = BlobServiceClient(
                    account_url=f"https://{self._account_name}.blob.core.windows.net",
                    credential=DefaultAzureCredential(),
                )
                udk = client.get_user_delegation_key(start, expiry)
                sas_token = generate_blob_sas(
                    account_name=self._account_name,
                    container_name=container_name,
                    blob_name=blob_path,
                    user_delegation_key=udk,
                    permission=BlobSasPermissions(read=True),
                    expiry=expiry,
                    start=start,
                )

            blob_base = f"https://{self._account_name}.blob.core.windows.net/{container_name}/{blob_path}"
            return f"{blob_base}?{sas_token}"
        except Exception as exc:  # noqa: BLE001
            logger.warning("SASGenerator: failed to generate SAS URL — %s", exc)
            return url


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


def _parse_blob_url(blob_url: str) -> tuple[str, str]:
    """Parse an Azure Blob Storage URL into (container_name, blob_path).

    Raises ValueError on invalid URL format.
    """

    parsed = urlparse(blob_url)
    parts = [p for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        raise ValueError(f"Invalid blob URL format: {blob_url!r}")
    container = parts[0]
    blob_path = "/".join(parts[1:])
    return container, blob_path
