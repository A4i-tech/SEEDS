import logging
import io
import os
import wave
from typing import Optional
from openai import AsyncOpenAI

logger = logging.getLogger("ml-audio-service")

class AudioTranscriber:
    def __init__(self):
        logger.info("Initializing AudioTranscriber (AsyncOpenAI API)...")
        api_key = os.environ.get("OPENAI_API_KEY")
        if not api_key:
            logger.warning("OPENAI_API_KEY not found in environment variables.")
        self.client = AsyncOpenAI(api_key=api_key)
        self.buffer = bytearray()
        self.sample_rate = 16000
        # 8 seconds buffer (16k * 2 bytes * 8)
        self.buffer_limit_bytes = 16000 * 2 * 8 
        logger.info("AudioTranscriber initialized.")

    async def process_chunk(self, audio_data: bytes) -> Optional[dict]:
        self.buffer.extend(audio_data)
        
        if len(self.buffer) >= self.buffer_limit_bytes:
            return await self._transcribe()
        return None

    async def _transcribe(self) -> Optional[dict]:
        if not self.buffer:
            return None

        # Create a WAV file in memory
        wav_buffer = io.BytesIO()
        with wave.open(wav_buffer, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)  # 16-bit
            wf.setframerate(self.sample_rate)
            wf.writeframes(self.buffer)
        
        wav_buffer.seek(0)
        wav_buffer.name = "audio.wav"  # OpenAI needs a filename

        try:
            logger.info("Sending audio to OpenAI Whisper API...")
            transcript = await self.client.audio.transcriptions.create(
                model="whisper-1", 
                file=wav_buffer,
                language="en",
                response_format="verbose_json",
                prompt="This is a phone call. The number you have called has put you on hold. Please wait."
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
                logger.info(f"TRANSCRIPTION [Duration: {duration}s]: {text}")
                return {
                    "text": text,
                    "duration": duration,
                    "segments": segments
                }
            return None

        except Exception as e:
            logger.error(f"OpenAI API Error: {e}")
            self.buffer = bytearray() 
            return None
