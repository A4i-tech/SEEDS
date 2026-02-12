from pathlib import Path
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.audio.capture import AudioCaptureSession


def test_audio_capture_session_writes_chunks(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("AUDIO_CAPTURE_DIR", str(tmp_path))

    session = AudioCaptureSession("conf-123")
    try:
        session.write_chunk(b"abc")
        session.write_chunk(b"defg")
        session.write_chunk(b"")
    finally:
        session.close()

    capture_file = Path(session.file_path)
    assert capture_file.exists()
    assert capture_file.read_bytes() == b"abcdefg"
    assert session.total_bytes == 7
