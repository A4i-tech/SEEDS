import os
import sys
import wave

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.audio.audio_capture import AudioCaptureService


def test_audio_capture_service_writes_chunks(tmp_path, monkeypatch):
    monkeypatch.setenv("AUDIO_CAPTURE_ENABLED", "true")
    monkeypatch.setenv("AUDIO_CAPTURE_UPLOAD_TO_AZURE", "false")
    monkeypatch.setenv("AUDIO_CAPTURE_DIR", str(tmp_path))

    service = AudioCaptureService("conf-123")
    # 16-bit samples (2 bytes each)
    service.write_chunk(b"\x00\x01" * 50)
    service.write_chunk(b"\x00\x02" * 50)
    service.write_chunk(b"")

    assert service.total_bytes == 200
    assert service.file_path is not None

    # Close so we can read the file
    service._close_file()

    # Verify it's a valid WAV
    with wave.open(service.file_path, "rb") as wf:
        assert wf.getnchannels() == 1
        assert wf.getsampwidth() == 2
        assert wf.getframerate() == 8000
        assert wf.getnframes() == 100  # 200 bytes / 2 bytes per sample


def test_audio_capture_service_disabled(monkeypatch):
    monkeypatch.setenv("AUDIO_CAPTURE_ENABLED", "false")

    service = AudioCaptureService("conf-456")
    service.write_chunk(b"data")

    assert service.total_bytes == 0
    assert service.file_path is None


def test_audio_capture_service_blob_name():
    """Verify blob name follows date-partitioned pattern."""
    import os
    os.environ["AUDIO_CAPTURE_ENABLED"] = "true"
    os.environ["AUDIO_CAPTURE_UPLOAD_TO_AZURE"] = "false"
    os.environ["AUDIO_CAPTURE_DIR"] = "/tmp"

    service = AudioCaptureService("test-conf")
    blob_name = service._build_blob_name()

    # Should be YYYY/MM/DD/conf_id_HHMMSS.wav
    parts = blob_name.split("/")
    assert len(parts) == 4
    assert parts[3].startswith("test-conf_")
    assert parts[3].endswith(".wav")

    service._close_file()
    service._cleanup_local()
