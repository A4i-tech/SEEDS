"""
SAS token generation service for Azure Blob Storage.

Ported from ConferenceV2 app/services/singletons/sas_gen.py.

SECURITY:
  - SAS token values are NEVER logged — only status messages are emitted.
  - Account key is stored without repr to avoid accidental log exposure.
  - ``get_url_with_sas`` falls back to the original URL on any error so the
    caller always receives a usable URL (degraded, not broken).
"""

from __future__ import annotations

import datetime
import logging
from urllib.parse import unquote, urlparse

from app.platform.settings import get_settings

logger = logging.getLogger(__name__)


class SASService:
    """Generate short-lived read SAS tokens for Azure Blob URLs.

    Supports both account-key auth (fast, synchronous) and DefaultAzureCredential
    user-delegation SAS (requires an extra API call, cached for the key lifetime).

    Instantiate once at lifespan startup and reuse throughout the process.
    """

    def __init__(self) -> None:
        settings = get_settings()
        self._account_name: str = settings.azure_storage_account_name
        self._account_key: str = settings.azure_storage_account_key
        self._sas_expiry_hours: int = 1  # configurable if needed
        self._azure_enabled: bool = settings.azure_storage_enabled

        self._use_account_key: bool = bool(self._account_name and self._account_key)
        self._credential = None
        if not self._use_account_key:
            from azure.identity import DefaultAzureCredential  # noqa: PLC0415

            self._credential = DefaultAzureCredential()
            logger.info("SASService: using DefaultAzureCredential for SAS generation")
        else:
            logger.info("SASService: using account key for SAS generation")

        self._blob_service_client = None
        self._user_delegation_key = None
        self._key_expiry_time: datetime.datetime | None = None

    def _get_blob_service_client(self, url: str):
        """Return (or create) a BlobServiceClient for the storage account in *url*."""
        from azure.storage.blob import BlobServiceClient  # noqa: PLC0415

        if self._blob_service_client is None:
            parsed = urlparse(url)
            account_url = f"{parsed.scheme}://{parsed.netloc}"
            if self._use_account_key:
                self._blob_service_client = BlobServiceClient(
                    account_url=account_url,
                    credential=self._account_key,
                )
            else:
                self._blob_service_client = BlobServiceClient(
                    account_url=account_url,
                    credential=self._credential,
                )
        return self._blob_service_client

    def _get_user_delegation_key(self, client):
        """Return a cached user-delegation key, refreshing if near expiry."""
        if self._use_account_key:
            return None  # Not needed for account-key SAS
        now = datetime.datetime.utcnow()
        if self._user_delegation_key is None or (
            self._key_expiry_time and now >= self._key_expiry_time
        ):
            self._key_expiry_time = now + datetime.timedelta(hours=self._sas_expiry_hours)
            self._user_delegation_key = client.get_user_delegation_key(now, self._key_expiry_time)
        return self._user_delegation_key

    def get_url_with_sas(self, url: str) -> str:
        """Return *url* appended with a short-lived read SAS token.

        Falls back to the original *url* if Azure is disabled or on any error.
        SECURITY: the generated SAS token is NEVER included in log messages.
        """
        if not self._azure_enabled:
            logger.warning("SASService: Azure Storage disabled, returning original URL")
            return url

        try:
            from azure.storage.blob import BlobSasPermissions, generate_blob_sas  # noqa: PLC0415

            decoded = unquote(url)
            parsed = urlparse(decoded)
            parts = [p for p in parsed.path.split("/") if p]
            if len(parts) < 2:
                raise ValueError(f"Cannot parse blob URL: {url!r}")
            container_name = parts[0]
            blob_path = "/".join(parts[1:])

            client = self._get_blob_service_client(url)
            blob_client = client.get_blob_client(container_name, blob_path)
            expiry = datetime.datetime.utcnow() + datetime.timedelta(hours=self._sas_expiry_hours)

            if self._use_account_key:
                sas_token = generate_blob_sas(
                    account_name=client.account_name,
                    container_name=container_name,
                    blob_name=blob_path,
                    account_key=self._account_key,
                    permission=BlobSasPermissions(read=True),
                    expiry=expiry,
                )
            else:
                delegation_key = self._get_user_delegation_key(client)
                sas_token = generate_blob_sas(
                    account_name=client.account_name,
                    container_name=container_name,
                    blob_name=blob_path,
                    permission=BlobSasPermissions(read=True),
                    expiry=self._key_expiry_time or expiry,
                    user_delegation_key=delegation_key,
                )

            # SECURITY: SAS token not logged
            logger.info("SASService: generated SAS URL container=%s", container_name)
            return blob_client.url + "?" + sas_token

        except Exception as exc:
            logger.error("SASService: failed to generate SAS URL — %s", type(exc).__name__)
            logger.warning("SASService: falling back to original URL without SAS token")
            return url
