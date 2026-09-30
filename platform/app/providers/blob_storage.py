"""
Blob storage provider interface and backend selection.

Backends live in separate modules and are imported only when selected by
STORAGE_BACKEND, so the Azure SDK is never needed for the default S3 backend:
  - app.providers.s3_blob_storage     (S3-compatible, boto3)
  - app.providers.azure_blob_storage  (Azure Blob, needs the ``azure`` extra)

SECURITY:
  - SAS / presigned URLs are NEVER logged.
  - Credentials are never returned to callers.
  - Short expiry defaults (1 hour) to minimise token exposure window.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import IO
from urllib.parse import unquote, urlparse

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)


class BlobStorageProvider(ABC):
    @abstractmethod
    async def upload_file(
        self,
        container: str,
        blob_name: str,
        data: bytes | IO[bytes],
        content_type: str = "application/octet-stream",
    ) -> str: ...

    @abstractmethod
    async def download_file(self, container: str, blob_name: str) -> bytes: ...

    @abstractmethod
    async def exists(self, container: str, blob_name: str) -> bool: ...

    @abstractmethod
    async def delete_blob(self, container: str, blob_name: str) -> bool: ...

    @abstractmethod
    async def generate_sas_url(
        self,
        container: str,
        blob_name: str,
        expiry_hours: int = 1,
        read: bool = True,
        write: bool = False,
    ) -> str: ...

    @abstractmethod
    def generate_sas_url_sync(self, container: str, blob_name: str, expiry_hours: int = 1) -> str: ...

    @abstractmethod
    def blob_url(self, container: str, blob_name: str) -> str: ...

    async def download_from_url(self, blob_url: str) -> bytes:
        container, blob_path = _parse_blob_url(blob_url)
        return await self.download_file(container, blob_path)

    async def get_sas_url_from_blob_url(self, blob_url: str, expiry_hours: int = 1) -> str:
        container, blob_path = _parse_blob_url(blob_url)
        return await self.generate_sas_url(container, blob_path, expiry_hours=expiry_hours)

    async def get_upload_sas_url(
        self,
        container: str,
        blob_name: str,
        expiry_hours: int = 1,
    ) -> str:
        return await self.generate_sas_url(
            container, blob_name, expiry_hours=expiry_hours, read=True, write=True
        )

    def extract_blob_path_without_extension(self, blob_url: str) -> str:
        _container, blob_path = _parse_blob_url(blob_url)
        dot_pos = blob_path.rfind(".")
        if dot_pos > 0:
            return blob_path[:dot_pos]
        return blob_path


# ---------------------------------------------------------------------------
# SASGenerator — synchronous wrapper used by VonageStreamAction.get()
# ---------------------------------------------------------------------------


class SASGenerator:
    """Synchronous signed-URL generator for use in Vonage action get() calls.

    Falls back to returning the original URL when signing is disabled or fails.
    """

    def __init__(self) -> None:
        self._azure_enabled: bool = get_settings().azure_blob_sas_enabled
        self._sas_expiry_hours: int = 1

    def get_url_with_sas(self, url: str) -> str:
        """Return *url* with a read token appended, or the original URL on error."""
        if not self._azure_enabled:
            return url
        try:
            container, blob_path = _parse_blob_url(url)
            return get_blob_storage_provider().generate_sas_url_sync(
                container, blob_path, self._sas_expiry_hours
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning("SASGenerator: failed to generate SAS URL — %s", exc)
            return url


# ---------------------------------------------------------------------------
# Module-level helpers
# ---------------------------------------------------------------------------


_provider: BlobStorageProvider | None = None


def get_blob_storage_provider() -> BlobStorageProvider:
    """Return the process-wide provider, built on first call from STORAGE_BACKEND."""
    global _provider
    if _provider is None:
        _provider = _build_provider()
    return _provider


def _build_provider() -> BlobStorageProvider:
    backend = get_settings().storage_backend
    if backend == "s3":
        from app.providers.s3_blob_storage import S3BlobStorageProvider  # noqa: PLC0415

        return S3BlobStorageProvider()
    if backend == "azure":
        try:
            from app.providers.azure_blob_storage import AzureBlobStorageProvider  # noqa: PLC0415
        except ImportError as exc:
            raise RuntimeError(
                "STORAGE_BACKEND=azure needs the azure-storage-blob package. "
                "Install it with 'poetry install -E azure' or set STORAGE_BACKEND=s3."
            ) from exc
        return AzureBlobStorageProvider()
    raise ValueError(f"STORAGE_BACKEND={backend!r} is not supported. Set it to 'azure' or 's3'.")


def _parse_blob_url(blob_url: str) -> tuple[str, str]:
    """Parse a blob URL into (container_name, blob_path), ignoring the host.

    Works for Azure (``host/container/blob``) and path-style S3 (``host/bucket/key``).
    Raises ValueError on invalid URL format.
    """

    parsed = urlparse(blob_url)
    parts = [unquote(p) for p in parsed.path.split("/") if p]
    if len(parts) < 2:
        raise ValueError(f"Invalid blob URL format: {blob_url!r}")
    container = parts[0]
    blob_path = "/".join(parts[1:])
    return container, blob_path
