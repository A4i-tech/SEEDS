"""
Extra coverage for audio_recording_consumer.py.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


class TestAudioRecordingConsumerExtra:
    @pytest.mark.asyncio
    async def test_handle_audio_frame_with_session(self) -> None:
        from app.consumers.audio_recording_consumer import AudioFrame, AudioRecordingConsumer

        consumer = AudioRecordingConsumer()
        frame = AudioFrame(conference_id="conf1", audio_bytes=b"\x00" * 100)

        mock_session = MagicMock()
        mock_session.write_chunk = MagicMock()
        consumer._capture_sessions["conf1"] = mock_session

        await consumer._handle_audio_frame(frame)
        mock_session.write_chunk.assert_called_once_with(b"\x00" * 100)

    @pytest.mark.asyncio
    async def test_handle_audio_frame_write_error(self) -> None:
        from app.consumers.audio_recording_consumer import AudioFrame, AudioRecordingConsumer

        consumer = AudioRecordingConsumer()
        frame = AudioFrame(conference_id="conf1", audio_bytes=b"\x00" * 100)

        mock_session = MagicMock()
        mock_session.write_chunk = MagicMock(side_effect=OSError("disk error"))
        consumer._capture_sessions["conf1"] = mock_session

        await consumer._handle_audio_frame(frame)  # Should not raise

    @pytest.mark.asyncio
    async def test_handle_finalize_no_session(self) -> None:
        from app.consumers.audio_recording_consumer import (
            AudioRecordingConsumer,
            FinalizeConference,
        )

        consumer = AudioRecordingConsumer()
        msg = FinalizeConference(conference_id="gone_conf")

        await consumer._handle_finalize(msg)  # No session — early return

    @pytest.mark.asyncio
    async def test_handle_finalize_with_url(self) -> None:
        from app.consumers.audio_recording_consumer import (
            AudioRecordingConsumer,
            FinalizeConference,
        )

        consumer = AudioRecordingConsumer()
        msg = FinalizeConference(conference_id="conf1")

        mock_session = MagicMock()
        mock_session.finalize = AsyncMock(return_value="https://blob.azure.com/audio/conf1.wav")
        consumer._capture_sessions["conf1"] = mock_session

        await consumer._handle_finalize(msg)
        mock_session.finalize.assert_called_once()

    @pytest.mark.asyncio
    async def test_handle_finalize_finalize_error(self) -> None:
        from app.consumers.audio_recording_consumer import (
            AudioRecordingConsumer,
            FinalizeConference,
        )

        consumer = AudioRecordingConsumer()
        msg = FinalizeConference(conference_id="conf1")

        mock_session = MagicMock()
        mock_session.finalize = AsyncMock(side_effect=Exception("upload failed"))
        consumer._capture_sessions["conf1"] = mock_session

        await consumer._handle_finalize(msg)  # Should not raise

    @pytest.mark.asyncio
    async def test_handle_finalize_with_url_analysis_queue_full(self) -> None:
        """When analysis queue is full, should log warning and not crash."""
        import asyncio

        from app.consumers.audio_recording_consumer import (
            AudioRecordingConsumer,
            FinalizeConference,
        )

        consumer = AudioRecordingConsumer()
        msg = FinalizeConference(conference_id="conf_full")

        mock_session = MagicMock()
        mock_session.finalize = AsyncMock(return_value="https://blob.azure.com/audio/conf_full.wav")
        consumer._capture_sessions["conf_full"] = mock_session

        with patch("app.consumers.audio_recording_consumer._audio_analysis_queue") as mock_q:
            mock_q.put_nowait = MagicMock(side_effect=asyncio.QueueFull())
            await consumer._handle_finalize(msg)  # Should not raise

    def test_get_or_create_session_disabled(self) -> None:
        from app.consumers.audio_recording_consumer import AudioRecordingConsumer

        consumer = AudioRecordingConsumer()

        mock_settings = MagicMock()
        mock_settings.audio_capture_enabled = False
        mock_settings.audio_capture_upload_to_azure = False
        mock_settings.audio_capture_container = "container"
        mock_settings.audio_capture_delete_local_after_upload = False
        mock_settings.azure_storage_connection_string = ""
        mock_settings.audio_capture_dir = "/tmp"

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            result = consumer._get_or_create_session("conf_disabled")
        assert result is None

    def test_get_or_create_session_cached(self) -> None:
        from app.consumers.audio_recording_consumer import AudioRecordingConsumer

        consumer = AudioRecordingConsumer()
        mock_session = MagicMock()
        consumer._capture_sessions["cached_conf"] = mock_session

        result = consumer._get_or_create_session("cached_conf")
        assert result is mock_session

    def test_get_or_create_session_init_error(self) -> None:
        from app.consumers.audio_recording_consumer import AudioRecordingConsumer

        consumer = AudioRecordingConsumer()

        with patch("app.platform.settings.get_settings", side_effect=Exception("settings error")):
            result = consumer._get_or_create_session("error_conf")
        assert result is None


class TestAudioFrameClass:
    def test_audio_frame_creation(self) -> None:
        from app.consumers.audio_recording_consumer import AudioFrame

        frame = AudioFrame(conference_id="conf1", audio_bytes=b"\x00\x01\x02")
        assert frame.conference_id == "conf1"
        assert frame.audio_bytes == b"\x00\x01\x02"

    def test_finalize_conference_creation(self) -> None:
        from app.consumers.audio_recording_consumer import FinalizeConference

        msg = FinalizeConference(conference_id="conf1")
        assert msg.conference_id == "conf1"
