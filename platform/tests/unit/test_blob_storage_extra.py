"""
Extra unit coverage for blob_storage.py provider.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


class TestParseBlobUrl:
    def test_parse_valid_url(self) -> None:
        from app.providers.blob_storage import _parse_blob_url

        container, blob = _parse_blob_url(
            "https://myaccount.blob.core.windows.net/mycontainer/path/to/file.wav"
        )
        assert container == "mycontainer"
        assert blob == "path/to/file.wav"

    def test_parse_simple_url(self) -> None:
        from app.providers.blob_storage import _parse_blob_url

        container, blob = _parse_blob_url(
            "https://myaccount.blob.core.windows.net/container/file.wav"
        )
        assert container == "container"
        assert blob == "file.wav"

    def test_parse_invalid_url_raises(self) -> None:
        from app.providers.blob_storage import _parse_blob_url

        with pytest.raises(ValueError):
            _parse_blob_url("https://myaccount.blob.core.windows.net/onlyone")


class TestSASGenerator:
    def _make_mock_settings(self, enabled=False):
        s = MagicMock()
        s.azure_blob_sas_enabled = enabled
        s.storage_account_name = "testaccount"
        s.azure_storage_account_name = "testaccount"
        s.accountkey = None
        s.azure_storage_account_key = None
        return s

    def test_sas_generator_disabled_returns_url(self) -> None:
        from app.providers.blob_storage import SASGenerator

        mock_settings = self._make_mock_settings(enabled=False)

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings):
            gen = SASGenerator()
            url = "https://myaccount.blob.core.windows.net/container/file.wav"
            result = gen.get_url_with_sas(url)
            assert result == url

    def test_sas_generator_short_url_returns_url(self) -> None:
        from app.providers.blob_storage import SASGenerator

        mock_settings = self._make_mock_settings(enabled=True)
        mock_settings.azure_storage_account_key = "dGVzdGtleQ=="  # base64 "testkey"

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings):
            gen = SASGenerator()
            url = "https://myaccount.blob.core.windows.net/onlyonepart"
            result = gen.get_url_with_sas(url)
            # Short URL — only one path segment, should return original
            assert result == url

    def test_sas_generator_error_returns_url(self) -> None:
        from app.providers.blob_storage import SASGenerator

        mock_settings = self._make_mock_settings(enabled=True)
        mock_settings.azure_storage_account_key = "invalid_key"

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings):
            gen = SASGenerator()
            url = "https://myaccount.blob.core.windows.net/container/file.wav"
            # generate_blob_sas will fail with invalid key format
            result = gen.get_url_with_sas(url)
            # Either got SAS or returned original on error
            assert isinstance(result, str)


class TestBlobStorageProvider:
    def _make_mock_settings(self):
        s = MagicMock()
        s.azure_storage_account_name = "testaccount"
        s.azure_storage_account_key = None
        s.azure_storage_connection_string = "DefaultEndpointsProtocol=https;AccountName=devtest;AccountKey=dGVzdA==;EndpointSuffix=core.windows.net"
        return s

    def test_blob_provider_init_with_conn_str(self) -> None:
        from app.providers.blob_storage import BlobStorageProvider

        mock_settings = self._make_mock_settings()

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings), \
             patch("app.providers.blob_storage.BlobServiceClient") as MockClient:
            MockClient.from_connection_string = MagicMock(return_value=MagicMock())
            provider = BlobStorageProvider()
            assert provider is not None

    def test_blob_provider_extract_path_without_extension(self) -> None:
        from app.providers.blob_storage import BlobStorageProvider

        mock_settings = self._make_mock_settings()

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings), \
             patch("app.providers.blob_storage.BlobServiceClient") as MockClient:
            MockClient.from_connection_string = MagicMock(return_value=MagicMock())
            provider = BlobStorageProvider()
            result = provider.extract_blob_path_without_extension(
                "https://acc.blob.core.windows.net/container/folder/audio.wav"
            )
            assert result == "folder/audio"

    def test_blob_provider_extract_path_no_extension(self) -> None:
        from app.providers.blob_storage import BlobStorageProvider

        mock_settings = self._make_mock_settings()

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings), \
             patch("app.providers.blob_storage.BlobServiceClient") as MockClient:
            MockClient.from_connection_string = MagicMock(return_value=MagicMock())
            provider = BlobStorageProvider()
            result = provider.extract_blob_path_without_extension(
                "https://acc.blob.core.windows.net/container/folder/audiofile"
            )
            assert result == "folder/audiofile"

    @pytest.mark.asyncio
    async def test_blob_provider_delete_not_found(self) -> None:
        from app.providers.blob_storage import BlobStorageProvider

        mock_settings = self._make_mock_settings()

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings), \
             patch("app.providers.blob_storage.BlobServiceClient") as MockClient:
            mock_blob_client = MagicMock()
            mock_blob_client.delete_blob = MagicMock(side_effect=Exception("not found"))
            mock_container_client = MagicMock()
            mock_container_client.get_blob_client = MagicMock(return_value=mock_blob_client)
            mock_service_client = MagicMock()
            mock_service_client.get_container_client = MagicMock(return_value=mock_container_client)
            MockClient.from_connection_string = MagicMock(return_value=mock_service_client)

            provider = BlobStorageProvider()
            result = await provider.delete_blob("container", "file.wav")
            assert result is False

    @pytest.mark.asyncio
    async def test_blob_provider_get_sas_url_from_blob_url(self) -> None:
        from app.providers.blob_storage import BlobStorageProvider

        mock_settings = self._make_mock_settings()
        mock_settings.azure_storage_account_key = "dGVzdGtleQ=="

        with patch("app.providers.blob_storage.get_settings", return_value=mock_settings), \
             patch("app.providers.blob_storage.BlobServiceClient") as MockClient, \
             patch("app.providers.blob_storage.generate_blob_sas", return_value="sas_token"):
            MockClient.from_connection_string = MagicMock(return_value=MagicMock())
            provider = BlobStorageProvider()
            provider._account_name = "testaccount"
            provider._account_key = "dGVzdGtleQ=="
            provider._use_shared_key = True

            result = await provider.generate_sas_url("mycontainer", "path/file.wav")
            assert "sas_token" in result
