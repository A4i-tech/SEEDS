"""Integration test: verify relay audio path writes to AudioCaptureService and uploads via finalize_capture_session."""
import asyncio
import os
import sys
import wave
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.mark.asyncio
async def test_relay_path_captures_and_finalizes(tmp_path, monkeypatch):
    # Env: capture on, upload off (we just verify file + finalize)
    monkeypatch.setenv("AUDIO_CAPTURE_ENABLED", "true")
    monkeypatch.setenv("AUDIO_CAPTURE_UPLOAD_TO_AZURE", "false")
    monkeypatch.setenv("AUDIO_CAPTURE_DIR", str(tmp_path))
    monkeypatch.setenv("AUDIO_ANALYSIS_ENABLED", "true")

    from config import Settings
    settings = Settings(_env_file=None)

    # Stub transcriber + hold detector to avoid hitting OpenAI
    with patch(
        "app.services.audio.transcriber.AudioTranscriber"
    ) as mock_transcriber_cls, patch(
        "app.services.audio.hold_detector.HoldDetector.create",
        new=AsyncMock(return_value=MagicMock(
            detect=AsyncMock(return_value={
                "is_hold": False,
                "score": 0.0,
                "matched_phrase": "",
                "threshold": 0.82,
                "detection_method": "semantic_similarity",
            })
        )),
    ), patch(
        "app.services.conference_call.get_settings",
        return_value=settings,
    ):
        # Transcriber returns None so process_audio_message skips analysis work
        mock_trans = MagicMock()
        mock_trans.process_chunk = AsyncMock(return_value=None)
        mock_transcriber_cls.return_value = mock_trans

        from app.services.conference_call import ConferenceCall

        # Build a minimal ConferenceCall with mocked deps
        conf = ConferenceCall(
            conf_id="test-relay-conf",
            communication_api=MagicMock(),
            storage_manager=MagicMock(),
            connection_manager=MagicMock(),
        )

        # Start relay (creates queue + consumer task, which also creates capture session)
        conf.start_remote_audio_relay()

        # Wait a moment for consumer to initialize transcriber/hold detector/capture
        await asyncio.sleep(0.2)

        # Push 1 second of silent-ish 16-bit 8kHz audio (16000 bytes)
        sample_bytes = b"\x00\x01" * 8000
        # Feed in 320-byte chunks (real websocket frame size)
        chunk_size = 320
        for i in range(0, len(sample_bytes), chunk_size):
            await conf._remote_audio_queue.put(sample_bytes[i:i + chunk_size])

        # Let consumer drain queue
        await asyncio.sleep(0.5)

        assert conf._capture_session is not None, "capture session should be created"
        assert conf._capture_session.total_bytes == 16000, (
            f"expected 16000 bytes, got {conf._capture_session.total_bytes}"
        )
        file_path = conf._capture_session.file_path
        assert file_path and os.path.exists(file_path)

        # Stop relay and finalize
        conf.stop_remote_audio_relay()
        url = await conf.finalize_capture_session()

        # Upload disabled → url None but file remains readable
        assert url is None

        # Verify WAV on disk
        with wave.open(file_path, "rb") as wf:
            assert wf.getnchannels() == 1
            assert wf.getsampwidth() == 2
            assert wf.getframerate() == 8000
            assert wf.getnframes() == 8000  # 1 second @ 8kHz

        # finalize_capture_session must be idempotent
        assert await conf.finalize_capture_session() is None


@pytest.mark.asyncio
async def test_relay_skips_capture_when_disabled(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIO_CAPTURE_ENABLED", "false")
    monkeypatch.setenv("AUDIO_ANALYSIS_ENABLED", "true")
    monkeypatch.setenv("AUDIO_CAPTURE_DIR", str(tmp_path))

    from config import Settings
    settings = Settings(_env_file=None)

    with patch(
        "app.services.audio.transcriber.AudioTranscriber"
    ) as mock_transcriber_cls, patch(
        "app.services.audio.hold_detector.HoldDetector.create",
        new=AsyncMock(return_value=MagicMock()),
    ), patch(
        "app.services.conference_call.get_settings",
        return_value=settings,
    ):
        mock_trans = MagicMock()
        mock_trans.process_chunk = AsyncMock(return_value=None)
        mock_transcriber_cls.return_value = mock_trans

        from app.services.conference_call import ConferenceCall

        conf = ConferenceCall(
            conf_id="test-disabled-conf",
            communication_api=MagicMock(),
            storage_manager=MagicMock(),
            connection_manager=MagicMock(),
        )
        conf.start_remote_audio_relay()
        await asyncio.sleep(0.2)

        await conf._remote_audio_queue.put(b"\x00\x01" * 100)
        await asyncio.sleep(0.3)

        assert conf._capture_session is None
        conf.stop_remote_audio_relay()


@pytest.mark.asyncio
async def test_relay_capture_continues_when_analysis_init_fails(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIO_CAPTURE_ENABLED", "true")
    monkeypatch.setenv("AUDIO_CAPTURE_UPLOAD_TO_AZURE", "false")
    monkeypatch.setenv("AUDIO_CAPTURE_DIR", str(tmp_path))
    monkeypatch.setenv("AUDIO_ANALYSIS_ENABLED", "true")

    from config import Settings
    settings = Settings(_env_file=None)

    with patch(
        "app.services.audio.transcriber.AudioTranscriber",
        side_effect=RuntimeError("bad openai key"),
    ), patch(
        "app.services.conference_call.get_settings",
        return_value=settings,
    ):
        from app.services.conference_call import ConferenceCall

        conf = ConferenceCall(
            conf_id="test-analysis-failure-conf",
            communication_api=MagicMock(),
            storage_manager=MagicMock(),
            connection_manager=MagicMock(),
        )

        conf.start_remote_audio_relay()
        await asyncio.sleep(0.2)

        assert conf._capture_session is not None

        sample_bytes = b"\x00\x01" * 200
        await conf._remote_audio_queue.put(sample_bytes)
        await asyncio.sleep(0.2)

        assert conf._capture_session.total_bytes == len(sample_bytes)
        conf.stop_remote_audio_relay()
        await conf.finalize_capture_session()


@pytest.mark.asyncio
async def test_schedule_capture_finalize_reuses_background_task(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIO_CAPTURE_ENABLED", "true")
    monkeypatch.setenv("AUDIO_CAPTURE_UPLOAD_TO_AZURE", "false")
    monkeypatch.setenv("AUDIO_CAPTURE_DIR", str(tmp_path))

    from app.services.audio.audio_capture import AudioCaptureService
    from app.services.conference_call import ConferenceCall

    conf = ConferenceCall(
        conf_id="test-background-finalize-conf",
        communication_api=MagicMock(),
        storage_manager=MagicMock(),
        connection_manager=MagicMock(),
    )
    conf._capture_session = AudioCaptureService("test-background-finalize-conf")
    conf._capture_session.write_chunk(b"\x00\x01" * 40)

    task = conf.schedule_capture_finalize()
    assert task is not None
    assert conf.schedule_capture_finalize() is task
    assert await task is None
    assert await conf.finalize_capture_session() is None
