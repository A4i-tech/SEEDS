"""
Extra coverage for audio_capture.py service.
"""

from __future__ import annotations

import tempfile
from unittest.mock import MagicMock

import pytest


class TestAudioCaptureServiceEnabled:
    """Tests for enabled AudioCaptureService with actual file operations."""

    def test_enabled_writes_wav_file(self, tmp_path) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = True
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "test-container"
        mock_settings.audio_capture_delete_local_after_upload = False
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = str(tmp_path)

        service = AudioCaptureService(conference_id="test_conf_write", settings=mock_settings)
        assert service.enabled is True
        assert service.file_path is not None
        assert service._wav_writer is not None

    def test_write_chunk_enabled(self, tmp_path) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = True
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "test-container"
        mock_settings.audio_capture_delete_local_after_upload = False
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = str(tmp_path)

        service = AudioCaptureService(conference_id="test_conf_chunk", settings=mock_settings)
        audio_data = b"\x00\x01" * 1000
        service.write_chunk(audio_data)
        assert service.total_bytes == len(audio_data)

    def test_write_chunk_disabled_no_write(self) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = False
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "test-container"
        mock_settings.audio_capture_delete_local_after_upload = False
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = tempfile.gettempdir()

        service = AudioCaptureService(conference_id="test_conf_disabled", settings=mock_settings)
        service.write_chunk(b"\x00" * 100)
        assert service.total_bytes == 0

    def test_write_chunk_empty_bytes_no_write(self, tmp_path) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = True
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "test-container"
        mock_settings.audio_capture_delete_local_after_upload = False
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = str(tmp_path)

        service = AudioCaptureService(conference_id="test_conf_empty", settings=mock_settings)
        service.write_chunk(b"")  # Empty bytes
        assert service.total_bytes == 0

    def test_close_file_enabled(self, tmp_path) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = True
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "test-container"
        mock_settings.audio_capture_delete_local_after_upload = False
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = str(tmp_path)

        service = AudioCaptureService(conference_id="test_conf_close", settings=mock_settings)
        service.write_chunk(b"\x00" * 100)
        service._close_file()
        assert service._wav_writer is None

    @pytest.mark.asyncio
    async def test_finalize_disabled_returns_none(self) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = False
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "test-container"
        mock_settings.audio_capture_delete_local_after_upload = False
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = tempfile.gettempdir()

        service = AudioCaptureService(conference_id="test_conf_finalize_disabled", settings=mock_settings)
        result = await service.finalize()
        assert result is None

    @pytest.mark.asyncio
    async def test_finalize_enabled_no_upload(self, tmp_path) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = True
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "test-container"
        mock_settings.audio_capture_delete_local_after_upload = False
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = str(tmp_path)

        service = AudioCaptureService(conference_id="test_conf_finalize_noup", settings=mock_settings)
        service.write_chunk(b"\x00\x01" * 500)
        result = await service.finalize()
        # No upload — returns file path or None
        assert result is None or isinstance(result, str)

    def test_build_blob_name(self, tmp_path) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = True
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "test-container"
        mock_settings.audio_capture_delete_local_after_upload = False
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = str(tmp_path)

        service = AudioCaptureService(conference_id="test_conf_blob", settings=mock_settings)
        blob_name = service._build_blob_name()
        assert "test_conf_blob" in blob_name
        assert ".wav" in blob_name

    def test_cleanup_local_no_file(self) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = False
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "test-container"
        mock_settings.audio_capture_delete_local_after_upload = True
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = tempfile.gettempdir()

        service = AudioCaptureService(conference_id="test_conf_cleanup", settings=mock_settings)
        service._cleanup_local()  # No file_path — should not crash


class TestAudioCaptureFlushUpload:
    @pytest.mark.asyncio
    async def test_flush_and_upload_no_upload(self, tmp_path) -> None:
        from app.services.audio.audio_capture import AudioCaptureService

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = True
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "test-container"
        mock_settings.audio_capture_delete_local_after_upload = False
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = str(tmp_path)

        service = AudioCaptureService(conference_id="test_conf_flush", settings=mock_settings)
        service.write_chunk(b"\x00" * 200)
        result = await service.flush_and_upload()
        # No upload configured — returns None
        assert result is None


class TestAudioCaptureProviderUpload:
    def _settings(self, tmp_path) -> MagicMock:
        s = MagicMock()
        s.audio_capture_enabled = True
        s.audio_capture_upload_to_azure = True
        s.audio_capture_container = "audio-recording"
        s.audio_capture_delete_local_after_upload = True
        s.audio_capture_dir = str(tmp_path)
        return s

    @pytest.mark.asyncio
    async def test_finalize_uploads_wav_through_provider_and_deletes_local_copy(self, tmp_path) -> None:
        import os
        from unittest.mock import AsyncMock, patch

        from app.services.audio.audio_capture import AudioCaptureService

        provider = MagicMock()
        provider.upload_file = AsyncMock(return_value="https://storage.test/audio-recording/x.wav")
        with patch("app.services.audio.audio_capture.get_blob_storage_provider", return_value=provider):
            service = AudioCaptureService("conf-up", settings=self._settings(tmp_path))
        service.write_chunk(b"\x00\x01" * 500)

        url = await service.finalize()

        assert url == "https://storage.test/audio-recording/x.wav"
        container, blob_name, _stream, content_type = provider.upload_file.await_args.args
        assert (container, content_type) == ("audio-recording", "audio/wav")
        assert blob_name.endswith(".wav") and "conf-up" in blob_name
        assert not os.path.exists(service.file_path)

    @pytest.mark.asyncio
    async def test_unavailable_provider_disables_upload_and_keeps_local_file(self, tmp_path) -> None:
        import os
        from unittest.mock import patch

        from app.services.audio.audio_capture import AudioCaptureService

        with patch(
            "app.services.audio.audio_capture.get_blob_storage_provider",
            side_effect=RuntimeError("storage unavailable"),
        ):
            service = AudioCaptureService("conf-down", settings=self._settings(tmp_path))
        service.write_chunk(b"\x00\x01" * 500)

        assert service.upload_to_azure is False
        assert await service.finalize() is None
        assert os.path.exists(service.file_path)
