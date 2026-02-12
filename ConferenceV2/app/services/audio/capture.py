import os
from datetime import datetime


class AudioCaptureSession:
    def __init__(self, conference_id: str):
        capture_dir = os.getenv("AUDIO_CAPTURE_DIR", "/tmp/conference-audio-capture")
        os.makedirs(capture_dir, exist_ok=True)
        ts = datetime.utcnow().strftime("%Y%m%dT%H%M%S")
        self.file_path = os.path.join(capture_dir, f"{conference_id}-{ts}.pcm")
        self._file = open(self.file_path, "ab")
        self.total_bytes = 0

    def write_chunk(self, audio_bytes: bytes) -> None:
        if not audio_bytes:
            return
        self._file.write(audio_bytes)
        self._file.flush()
        self.total_bytes += len(audio_bytes)

    def close(self) -> None:
        if self._file and not self._file.closed:
            self._file.close()
