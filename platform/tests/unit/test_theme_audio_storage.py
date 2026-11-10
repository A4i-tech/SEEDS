"""Theme audio lookups go through the provider interface, not Azure SDK clients."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def _provider(exists: bool | Exception) -> MagicMock:
    provider = MagicMock()
    if isinstance(exists, Exception):
        provider.exists = AsyncMock(side_effect=exists)
    else:
        provider.exists = AsyncMock(return_value=exists)
    provider.blob_url = MagicMock(return_value="https://storage.test/theme-titles/Math/1.0.mp3")
    provider.upload_file = AsyncMock(return_value="https://storage.test/theme-titles/new.mp3")
    return provider


class TestBlobServiceTheme:
    @pytest.mark.asyncio
    async def test_theme_audio_exists_checks_theme_container(self) -> None:
        from app.services.blob_service import theme_audio_exists

        provider = _provider(True)
        with patch("app.services.blob_service._get_provider", return_value=provider):
            assert await theme_audio_exists("Math") is True
        provider.exists.assert_awaited_once_with("theme-titles", "Math/1.0.mp3")

    @pytest.mark.asyncio
    async def test_theme_audio_exists_is_false_on_provider_error(self) -> None:
        from app.services.blob_service import theme_audio_exists

        with patch("app.services.blob_service._get_provider", return_value=_provider(RuntimeError("down"))):
            assert await theme_audio_exists("Math") is False

    @pytest.mark.asyncio
    async def test_get_theme_audio_url_uses_provider_blob_url(self) -> None:
        from app.services.blob_service import get_theme_audio_url

        provider = _provider(True)
        with patch("app.services.blob_service._get_provider", return_value=provider):
            url = await get_theme_audio_url("Math")
        assert url == "https://storage.test/theme-titles/Math/1.0.mp3"
        provider.blob_url.assert_called_once_with("theme-titles", "Math/1.0.mp3")


class TestContentJobThemeAudio:
    def _doc(self) -> dict:
        return {"_id": "c1", "language": "kn", "theme": {"english": "Math", "local": "ಗಣಿತ"}}

    @pytest.mark.asyncio
    async def test_existing_theme_audio_is_reused(self) -> None:
        from app.consumers.content_job_consumer import _process_tts_for_content

        provider = _provider(True)
        doc = self._doc()
        with patch("app.services.tts_service.synthesize", new=AsyncMock()) as synthesize:
            await _process_tts_for_content(doc, provider)

        assert doc["theme"]["audio_url"] == "https://storage.test/theme-titles/Math/1.0.mp3"
        synthesize.assert_not_awaited()
        provider.upload_file.assert_not_awaited()

    @pytest.mark.asyncio
    @pytest.mark.parametrize("exists", [False, RuntimeError("lookup failed")])
    async def test_missing_theme_audio_is_generated_and_uploaded(self, exists) -> None:
        from app.consumers.content_job_consumer import _process_tts_for_content

        provider = _provider(exists)
        doc = self._doc()
        with patch("app.services.tts_service.synthesize", new=AsyncMock(return_value=b"mp3")):
            await _process_tts_for_content(doc, provider)

        provider.upload_file.assert_awaited_once()
        assert provider.upload_file.await_args.args[:3] == ("theme-titles", "Math/1.0.mp3", b"mp3")
        assert doc["theme"]["audio_url"] == "https://storage.test/theme-titles/new.mp3"
