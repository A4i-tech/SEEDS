"""
Audio analysis consumer — transcription + hold detection on uploaded WAV segments.

Ported from ConferenceV2 audio/transcriber.py + audio/hold_detector.py.

Architecture:
  - Receives (conference_id, wav_url) tuples from the analysis queue.
  - Downloads the WAV from Azure Blob.
  - Runs: AudioTranscriber → HoldDetector.
  - Updates ConferenceCallState in MongoDB via conference_event_dispatcher.
  - Emits hold-detected conference events.

SECURITY:
  - Transcript text is never logged at INFO+ (PII risk).
  - WAV URLs are never logged (may embed SAS tokens).
"""

from __future__ import annotations

import logging
from typing import Any, Optional

from app.consumers.audio_recording_consumer import get_audio_analysis_queue
from app.consumers.base_consumer import BaseConsumer, PermanentError

logger = logging.getLogger(__name__)


class AudioAnalysisConsumer(BaseConsumer):
    """Processes uploaded WAV segments: transcription and hold detection.

    Reads from the shared ``_audio_analysis_queue`` produced by
    ``AudioRecordingConsumer``.
    """

    name = "audio_analysis_consumer"

    def __init__(self, conference_manager: Any) -> None:
        self._conference_manager = conference_manager
        self._transcriber: Optional[Any] = None
        self._hold_detector: Optional[Any] = None

    async def _run_loop(self) -> None:
        queue = get_audio_analysis_queue()
        while True:
            conference_id, wav_url = await queue.get()
            try:
                await self._safe_process((conference_id, wav_url))
            finally:
                queue.task_done()

    async def _ensure_pipeline(self) -> None:
        """Lazily initialise transcriber and hold detector."""
        from app.platform.settings import get_settings  # noqa: PLC0415

        settings = get_settings()
        if not settings.audio_analysis_enabled:
            return
        if self._transcriber is None:
            from app.services.audio.transcriber import AudioTranscriber  # noqa: PLC0415

            try:
                self._transcriber = AudioTranscriber()
            except Exception as exc:
                logger.error("audio_analysis: transcriber init failed — %s", exc)
        if self._hold_detector is None:
            from app.services.audio.hold_detector import HoldDetector  # noqa: PLC0415

            try:
                self._hold_detector = await HoldDetector.create()
            except Exception as exc:
                logger.error("audio_analysis: hold_detector init failed — %s", exc)

    async def process(self, message: tuple[str, str]) -> None:
        conference_id, wav_url = message
        await self._ensure_pipeline()

        if self._transcriber is None or self._hold_detector is None:
            logger.warning(
                "audio_analysis: pipeline unavailable, skipping conf_id=%s", conference_id
            )
            return

        conf = self._conference_manager.get_conference(conference_id)
        if conf is None:
            logger.debug("audio_analysis: conference gone conf_id=%s", conference_id)
            return

        # Download WAV
        try:
            from app.providers.blob_storage import BlobStorageProvider  # noqa: PLC0415

            blob_provider = BlobStorageProvider()
            audio_bytes = await blob_provider.download_from_url(wav_url)
        except Exception as exc:
            logger.error(
                "audio_analysis: download failed conf_id=%s — %s", conference_id, type(exc).__name__
            )
            return

        if not audio_bytes:
            return

        # Transcribe + hold detect
        from app.services.audio.websocket_audio_processor import process_audio_message  # noqa: PLC0415

        await process_audio_message(
            audio_bytes, conf, self._transcriber, self._hold_detector, conference_id
        )
