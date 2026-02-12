import logging
import io
import os
import wave
from typing import Optional, Dict, Any
import numpy as np
from scipy import signal
from openai import AsyncOpenAI
from app.conf_logger import logger_instance as logger

class AudioTranscriber:
    # Constants
    INPUT_RATE = 8000
    PROCESS_RATE = 16000
    # RMS threshold for silence (16-bit audio, max 32768). 
    # 300 is approx ~1% amplitude, sufficient for filtering background noise.
    SILENCE_THRESHOLD = 300
    BUFFER_DURATION_SEC = 8
    MAX_PENDING_WINDOWS = 4

    def __init__(self) -> None:
        logger.debug("Initializing AudioTranscriber (AsyncOpenAI API)...")
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY not found in environment variables.")
        self.client = AsyncOpenAI(api_key=api_key)
        self.buffer = bytearray()
        
        # Calculate buffer limit in bytes: rate * sample_width(2) * duration
        self.buffer_limit_bytes = self.INPUT_RATE * 2 * self.BUFFER_DURATION_SEC 
        # Keep memory bounded under bursty traffic while still preserving recent context.
        self.max_buffer_bytes = self.buffer_limit_bytes * self.MAX_PENDING_WINDOWS
        logger.debug(f"AudioTranscriber initialized ({self.INPUT_RATE}Hz -> {self.PROCESS_RATE}Hz).")

    async def process_chunk(self, audio_data: bytes) -> Optional[Dict[str, Any]]:
        if not audio_data:
            return None
        if not isinstance(audio_data, (bytes, bytearray)):
            raise TypeError("audio_data must be bytes-like")

        self.buffer.extend(audio_data)
        if len(self.buffer) > self.max_buffer_bytes:
            overflow = len(self.buffer) - self.max_buffer_bytes
            del self.buffer[:overflow]
            logger.warning(
                "Audio buffer overflow detected; dropped %s oldest bytes to maintain cap (%s bytes).",
                overflow,
                self.max_buffer_bytes,
            )
        
        if len(self.buffer) >= self.buffer_limit_bytes:
            return await self._transcribe()
        return None

    def _calculate_rms(self, audio_np: np.ndarray) -> float:
        """Calculate Root Mean Square amplitude of the audio signal."""
        if len(audio_np) == 0:
            return 0.0
        # Calculate RMS using float64 to prevent overflow during square
        return np.sqrt(np.mean(audio_np.astype(np.float64)**2))

    async def _transcribe(self) -> Optional[Dict[str, Any]]:
        if not self.buffer:
            return None

        try:
            # Convert buffer to numpy array (Int16, 8kHz)
            audio_np = np.frombuffer(self.buffer, dtype=np.int16)
            
            # --- VAD / Silence Detection ---
            rms = self._calculate_rms(audio_np)
            
            if rms < self.SILENCE_THRESHOLD:
                logger.debug(f"Silence detected (RMS: {rms:.2f} < {self.SILENCE_THRESHOLD}). Skipping transcription.")
                self.buffer = bytearray()
                return None
            # -------------------------------
            
            # Optimization: Convert to float32 for high-quality resampling
            audio_float = audio_np.astype(np.float32)
            
            # Calculate number of samples for 16kHz (2x 8kHz)
            num_samples = int(len(audio_np) * (self.PROCESS_RATE / self.INPUT_RATE))
            
            # Resample to 16kHz using float precision (signal.resample uses FFT)
            resampled_float = signal.resample(audio_float, num_samples)
            
            # Convert back to int16 for WAV standard format
            resampled_np = resampled_float.astype(np.int16)
            
            # Create a WAV file in memory with new rate
            wav_buffer = io.BytesIO()
            with wave.open(wav_buffer, "wb") as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)  # 16-bit
                wf.setframerate(self.PROCESS_RATE)
                wf.writeframes(resampled_np.tobytes())
            
            wav_buffer.seek(0)
            wav_buffer.name = "audio.wav"

            logger.debug(f"Sending audio to OpenAI Whisper API... (RMS: {rms:.2f})")
            transcript = await self.client.audio.transcriptions.create(
                model="whisper-1", 
                file=wav_buffer,
                language="en",
                response_format="verbose_json"
            )
            
            text = transcript.text.strip()
            duration = transcript.duration
            segments = []
            if hasattr(transcript, 'segments'):
                for seg in transcript.segments:
                    segments.append({
                        "start": seg.start,
                        "end": seg.end,
                        "text": seg.text.strip()
                    })
            
            # Clear buffer
            self.buffer = bytearray()
            
            if text:
                logger.debug(f"TRANSCRIPTION [Duration: {duration}s]: {text}")
                return {
                    "text": text,
                    "duration": duration,
                    "segments": segments
                }
            return None

        except Exception as e:
            logger.exception(f"OpenAI API Error: {e}")
            self.buffer = bytearray() 
            return None
