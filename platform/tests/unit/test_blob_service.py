"""Content-audio helpers over the blob storage provider — container and blob-name routing."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services import blob_service


@pytest.fixture
def provider(monkeypatch):
    provider = MagicMock()
    provider.upload_file = AsyncMock(return_value="https://blob/uploaded")
    provider.generate_sas_url = AsyncMock(return_value="https://blob/audio?sig=abc")
    monkeypatch.setattr(blob_service, "_get_provider", lambda: provider)
    return provider


@pytest.mark.asyncio
async def test_upload_content_audio_targets_the_output_container(provider) -> None:
    url = await blob_service.upload_content_audio("c1", b"pcm")
    assert url == "https://blob/uploaded"
    provider.upload_file.assert_awaited_once_with(
        "output-container", "c1/1.0.mp3", b"pcm", "audio/wav"
    )


@pytest.mark.asyncio
async def test_upload_content_audio_honours_a_custom_suffix(provider) -> None:
    await blob_service.upload_content_audio("c1", b"pcm", suffix="2.0.mp3")
    assert provider.upload_file.await_args.args[1] == "c1/2.0.mp3"


@pytest.mark.asyncio
async def test_content_audio_url_is_a_one_hour_sas(provider) -> None:
    assert await blob_service.get_content_audio_url("c1") == "https://blob/audio?sig=abc"
    provider.generate_sas_url.assert_awaited_once_with(
        "output-container", "c1/1.0.mp3", expiry_hours=1
    )


@pytest.mark.asyncio
async def test_title_audio_goes_to_the_titles_container_as_mpeg(provider) -> None:
    await blob_service.upload_title_audio("c1", b"mp3")
    provider.upload_file.assert_awaited_once_with(
        "experience-titles", "c1/1.0.mp3", b"mp3", "audio/mpeg"
    )


@pytest.mark.asyncio
async def test_theme_audio_goes_to_the_theme_container_keyed_by_english_name(provider) -> None:
    await blob_service.upload_theme_audio("Science", b"mp3")
    provider.upload_file.assert_awaited_once_with(
        "theme-titles", "Science/1.0.mp3", b"mp3", "audio/mpeg"
    )


@pytest.mark.asyncio
async def test_theme_audio_exists_when_the_blob_has_properties(provider) -> None:
    blob = MagicMock()
    blob.get_blob_properties = AsyncMock(return_value={"size": 1})
    provider.get_container_client.return_value.get_blob_client.return_value = blob

    assert await blob_service.theme_audio_exists("Science") is True
    provider.get_container_client.assert_called_once_with("theme-titles")


@pytest.mark.asyncio
async def test_theme_audio_does_not_exist_when_the_lookup_fails(provider) -> None:
    blob = MagicMock()
    blob.get_blob_properties = AsyncMock(side_effect=RuntimeError("BlobNotFound"))
    provider.get_container_client.return_value.get_blob_client.return_value = blob

    assert await blob_service.theme_audio_exists("Missing") is False


@pytest.mark.asyncio
async def test_theme_audio_url_is_the_plain_blob_url(provider) -> None:
    blob = MagicMock(url="https://blob/theme-titles/Science/1.0.mp3")
    provider.get_container_client.return_value.get_blob_client.return_value = blob

    assert await blob_service.get_theme_audio_url("Science") == (
        "https://blob/theme-titles/Science/1.0.mp3"
    )
    provider.get_container_client.return_value.get_blob_client.assert_called_once_with(
        "Science/1.0.mp3"
    )


def test_get_provider_returns_the_blob_storage_singleton() -> None:
    from app.providers.blob_storage import get_blob_storage_provider

    assert blob_service._get_provider() is get_blob_storage_provider()
