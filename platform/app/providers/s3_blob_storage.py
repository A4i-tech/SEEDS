"""
S3-compatible blob storage provider (STORAGE_BACKEND=s3).

Works with AWS S3, MinIO, and other S3-compatible servers. A container name maps
one to one to a bucket name. Addressing is always path-style.

boto3 is synchronous, so every network call runs in a worker thread and never
blocks the event loop. Presigning is local (no network) and runs inline.

SECURITY:
  - Presigned URLs are NEVER logged.
  - Credentials are never returned to callers.
"""

from __future__ import annotations

import asyncio
import io
import logging
from typing import IO
from urllib.parse import quote

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.platform.settings import get_settings
from app.providers.blob_storage import BlobStorageProvider

logger = logging.getLogger(__name__)

_NOT_FOUND_CODES = {"404", "NoSuchKey", "NotFound"}


class S3BlobStorageProvider(BlobStorageProvider):
    def __init__(self) -> None:
        settings = get_settings()
        self._client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            aws_access_key_id=settings.s3_access_key_id or None,
            aws_secret_access_key=settings.s3_secret_access_key or None,
            region_name=settings.s3_region,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
                # Newer boto3 adds checksum headers that many S3-compatible servers reject
                request_checksum_calculation="when_required",
                response_checksum_validation="when_required",
            ),
        )

    def blob_url(self, container: str, blob_name: str) -> str:
        return f"{self._client.meta.endpoint_url.rstrip('/')}/{container}/{quote(blob_name)}"

    async def upload_file(
        self,
        container: str,
        blob_name: str,
        data: bytes | IO[bytes],
        content_type: str = "application/octet-stream",
    ) -> str:
        fileobj = io.BytesIO(data) if isinstance(data, bytes) else data
        await asyncio.to_thread(
            self._client.upload_fileobj,
            fileobj,
            container,
            blob_name,
            ExtraArgs={"ContentType": content_type},
        )
        logger.info("blob_storage: uploaded blob container=%s name=%s", container, blob_name)
        return self.blob_url(container, blob_name)

    async def download_file(self, container: str, blob_name: str) -> bytes:
        def _get() -> bytes:
            return self._client.get_object(Bucket=container, Key=blob_name)["Body"].read()

        data = await asyncio.to_thread(_get)
        logger.debug("blob_storage: downloaded blob container=%s name=%s size=%d", container, blob_name, len(data))
        return data

    async def exists(self, container: str, blob_name: str) -> bool:
        try:
            await asyncio.to_thread(self._client.head_object, Bucket=container, Key=blob_name)
        except ClientError as exc:
            if exc.response["Error"]["Code"] in _NOT_FOUND_CODES:
                return False
            raise
        return True

    async def delete_blob(self, container: str, blob_name: str) -> bool:
        # S3 delete succeeds for a missing key, so check first to return False like Azure
        try:
            if not await self.exists(container, blob_name):
                return False
            await asyncio.to_thread(self._client.delete_object, Bucket=container, Key=blob_name)
            logger.info("blob_storage: deleted blob container=%s name=%s", container, blob_name)
            return True
        except Exception as exc:  # noqa: BLE001
            logger.warning("blob_storage: delete failed container=%s name=%s — %s", container, blob_name, exc)
            return False

    def _presign(self, container: str, blob_name: str, expiry_hours: int, write: bool) -> str:
        return self._client.generate_presigned_url(
            "put_object" if write else "get_object",
            Params={"Bucket": container, "Key": blob_name},
            ExpiresIn=expiry_hours * 3600,
        )

    async def generate_sas_url(
        self,
        container: str,
        blob_name: str,
        expiry_hours: int = 1,
        read: bool = True,
        write: bool = False,
    ) -> str:
        # A presigned S3 link allows one HTTP method: write gives PUT, otherwise GET
        url = self._presign(container, blob_name, expiry_hours, write)
        logger.info("blob_storage: generated presigned url container=%s name=%s expiry_hours=%d", container, blob_name, expiry_hours)
        return url

    def generate_sas_url_sync(self, container: str, blob_name: str, expiry_hours: int = 1) -> str:
        return self._presign(container, blob_name, expiry_hours, write=False)
