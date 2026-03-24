"""Quick test: generate a sample tone and upload via AudioCaptureService."""
import asyncio
import os
import sys
import importlib.util
import numpy as np
from dotenv import load_dotenv

load_dotenv()

# Load AudioCaptureService directly from file path to avoid app module chain
spec = importlib.util.spec_from_file_location(
    "audio_capture",
    os.path.join(os.path.dirname(__file__), "app", "services", "audio", "audio_capture.py"),
)
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
AudioCaptureService = mod.AudioCaptureService


async def main():
    conference_id = "test-conf-001"
    capture = AudioCaptureService(conference_id)

    if not capture.enabled:
        print("AUDIO_CAPTURE_ENABLED is not true - check .env")
        return

    # Generate 5 seconds of a 440 Hz sine wave at 8kHz/16-bit
    duration_sec = 5
    rate = 8000
    t = np.linspace(0, duration_sec, rate * duration_sec, endpoint=False)
    samples = (np.sin(2 * np.pi * 440 * t) * 16000).astype(np.int16)
    raw_bytes = samples.tobytes()

    # Feed in 320-byte chunks (same as real websocket)
    chunk_size = 320
    for i in range(0, len(raw_bytes), chunk_size):
        capture.append_chunk(raw_bytes[i : i + chunk_size])

    print(f"Buffered {len(capture.buffer)} bytes ({duration_sec}s of audio)")
    print("Uploading to Azure...")

    blob_url = await capture.flush_and_upload()
    if blob_url:
        print(f"SUCCESS - blob URL: {blob_url}")
    else:
        print("FAILED - no URL returned, check logs above")


if __name__ == "__main__":
    asyncio.run(main())
