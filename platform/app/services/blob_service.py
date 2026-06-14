"""
Blob service — thin wrapper over BlobStorageProvider for content audio operations.

Provides application-level helpers used by the content job consumer and controllers.
"""

from __future__ import annotations

import logging
from functools import lru_cache

logger = logging.getLogger(__name__)

_OUTPUT_CONTAINER = "output-container"
_TITLE_CONTAINER = "experience-titles"
_THEME_CONTAINER = "theme-titles"
_INPUT_CONTAINER = "input-container"


def _get_provider():
    """Lazily import and return the BlobStorageProvider singleton."""
    from app.providers.blob_storage import BlobStorageProvider  # noqa: PLC0415

    return BlobStorageProvider()


async def upload_content_audio(content_id: str, audio_bytes: bytes, suffix: str = "1.0.mp3") -> str:
    """Upload processed audio for *content_id* to the output container.

    Returns the blob URL.
    """
    blob_name = f"{content_id}/{suffix}"
    provider = _get_provider()
    url = await provider.upload_file(_OUTPUT_CONTAINER, blob_name, audio_bytes, "audio/wav")
    logger.info("blob_service: uploaded content audio content_id=%s blob=%s", content_id, blob_name)
    return url


async def get_content_audio_url(content_id: str, suffix: str = "1.0.mp3") -> str:
    """Return a fresh read-only SAS URL for the content audio blob.

    The SAS token is valid for 1 hour.
    """
    blob_name = f"{content_id}/{suffix}"
    provider = _get_provider()
    url = await provider.generate_sas_url(_OUTPUT_CONTAINER, blob_name, expiry_hours=1)
    return url


async def upload_title_audio(content_id: str, audio_bytes: bytes) -> str:
    """Upload TTS title audio to the experience-titles container."""
    blob_name = f"{content_id}/1.0.mp3"
    provider = _get_provider()
    return await provider.upload_file(_TITLE_CONTAINER, blob_name, audio_bytes, "audio/mpeg")


async def upload_theme_audio(theme_english: str, audio_bytes: bytes) -> str:
    """Upload TTS theme audio to the theme-titles container."""
    blob_name = f"{theme_english}/1.0.mp3"
    provider = _get_provider()
    return await provider.upload_file(_THEME_CONTAINER, blob_name, audio_bytes, "audio/mpeg")


async def theme_audio_exists(theme_english: str) -> bool:
    """Check if theme audio already exists for *theme_english*."""
    blob_name = f"{theme_english}/1.0.mp3"
    provider = _get_provider()
    try:
        container_client = provider.get_container_client(_THEME_CONTAINER)
        blob_client = container_client.get_blob_client(blob_name)
        blob_client.get_blob_properties()
        return True
    except Exception:  # noqa: BLE001
        return False


async def get_theme_audio_url(theme_english: str) -> str:
    """Return the URL for an existing theme audio blob (no SAS — public or pre-authed)."""
    provider = _get_provider()
    container_client = provider.get_container_client(_THEME_CONTAINER)
    blob_client = container_client.get_blob_client(f"{theme_english}/1.0.mp3")
    return blob_client.url
