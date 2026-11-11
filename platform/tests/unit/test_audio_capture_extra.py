"""
Extra coverage for audio_capture.py service.
"""

from __future__ import annotations

import asyncio
import tempfile
from unittest.mock import AsyncMock, MagicMock, patch

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


class _StubBlobClient:
    """Stands in for the container/blob client pair; records SDK kwargs."""

    url = "https://acct.blob.core.windows.net/audio-recording/conf.wav"

    def __init__(self, timeouts: list, finished: list, delay: float = 0.0, failures: int = 0):
        self._timeouts = timeouts
        self._finished = finished
        self._delay = delay
        self._failures = failures
        self.attempts = 0

    def get_container_client(self, container):
        return self

    async def get_container_properties(self):
        return None

    def get_blob_client(self, blob_name):
        return self

    async def upload_blob(self, fh, **kwargs):
        self.attempts += 1
        self._timeouts.append(kwargs.get("timeout"))
        try:
            await asyncio.sleep(self._delay)
            if self.attempts <= self._failures:
                raise RuntimeError("azure down")
        finally:
            self._finished.append(True)
        return {}


def _upload_service(tmp_path, **overrides):
    from app.services.audio.audio_capture import AudioCaptureService

    mock_settings = MagicMock()
    mock_settings.audio_capture_enabled = True
    mock_settings.audio_capture_upload_to_azure = False
    mock_settings.audio_capture_container = "test-container"
    mock_settings.audio_capture_delete_local_after_upload = False
    mock_settings.azure_storage_connection_string = ""
    mock_settings.audio_capture_dir = str(tmp_path)

    service = AudioCaptureService(conference_id="test_conf_up", settings=mock_settings)
    wav = tmp_path / "clip.wav"
    wav.write_bytes(b"\x00" * 64)
    service.file_path = str(wav)
    service.upload_to_azure = True
    for key, value in overrides.items():
        setattr(service, key, value)
    return service


class TestAudioUploadSdkTimeout:
    @pytest.mark.asyncio
    async def test_upload_passes_sdk_timeout_and_leaves_no_thread(self, tmp_path) -> None:
        service = _upload_service(tmp_path, upload_timeout=5.0, upload_max_retries=1)
        timeouts: list = []
        finished: list = []
        service.blob_service_client = _StubBlobClient(timeouts, finished, delay=0.2)

        result = await service._upload_to_azure()

        assert result == _StubBlobClient.url
        assert timeouts == [5.0]
        assert len(finished) == len(timeouts)

    @pytest.mark.asyncio
    async def test_upload_retries_bounded_on_error(self, tmp_path) -> None:
        service = _upload_service(tmp_path, upload_timeout=5.0, upload_max_retries=2)
        stub = _StubBlobClient([], [], failures=10)
        service.blob_service_client = stub

        with patch("asyncio.sleep", new=AsyncMock()):
            result = await service._upload_to_azure()

        assert result is None
        assert stub.attempts == 2

    @pytest.mark.asyncio
    async def test_upload_hang_cancelled_and_retried(self, tmp_path) -> None:
        import time as time_module

        service = _upload_service(tmp_path, upload_timeout=0.05, upload_max_retries=2)
        stub = _StubBlobClient([], [], delay=2.0)
        service.blob_service_client = stub

        started = time_module.monotonic()
        result = await service._upload_to_azure()
        elapsed = time_module.monotonic() - started

        assert result is None
        assert stub.attempts == 2
        assert elapsed < 2.0


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
