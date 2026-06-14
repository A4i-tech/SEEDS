"""
WebSocket audio frame processor — routes inbound audio to transcription and hold detection.

Ported from ConferenceV2 app/services/audio/websocket_audio_processor.py.

SECURITY:
  - Raw audio bytes are NEVER logged (PII risk).
  - Transcript text is redacted unless AUDIO_TRANSCRIPT_LOGGING_ENABLED=true.
"""

from __future__ import annotations

import json
import logging
import os
from collections import deque
from datetime import datetime, timezone
from typing import TYPE_CHECKING, Any, Optional

logger = logging.getLogger(__name__)

TRANSCRIPT_WINDOW_SIZE = 3
_transcript_logging = os.getenv("AUDIO_TRANSCRIPT_LOGGING_ENABLED", "false").lower() == "true"


def _mask_audio_text(text: str | None) -> str:
    if not text:
        return "<empty>"
    return f"<redacted len={len(text)}>"


def _remember_transcript(conf: Any, text: str) -> str:
    normalized = " ".join((text or "").split())
    if not normalized:
        return ""
    window = getattr(conf, "_hold_transcript_window", None)
    if window is None:
        window = deque(maxlen=TRANSCRIPT_WINDOW_SIZE)
        setattr(conf, "_hold_transcript_window", window)
    window.append(normalized)
    return " ".join(window)


async def process_audio_message(
    audio_bytes: bytes,
    conf: Any,
    transcriber: Any,
    hold_detector: Any,
    conference_id: str,
    capture_session: Optional[Any] = None,
) -> None:
    """Process a single binary audio frame: transcribe, detect hold, update state.

    SECURITY: audio_bytes are NEVER logged.
    """
    try:
        result = await transcriber.process_chunk(audio_bytes)
        if not result:
            return

        text = result.get("text", "")
        segments = result.get("segments", [])
        analysis_text = _remember_transcript(conf, text)
        detect_result = await hold_detector.detect(analysis_text)

        safe_text = text if _transcript_logging else _mask_audio_text(text)
        safe_analysis = analysis_text if _transcript_logging else _mask_audio_text(analysis_text)
        safe_matched = detect_result.get("matched_phrase") if _transcript_logging else _mask_audio_text(detect_result.get("matched_phrase"))

        analysis_log = {
            "event": "audio_analysis",
            "conference_id": conference_id,
            "text": safe_text,
            "analysis_text": safe_analysis,
            "is_hold": detect_result["is_hold"],
            "hold_score": float(f"{detect_result['score']:.4f}"),
            "hold_threshold": detect_result.get("threshold"),
            "matched_phrase": safe_matched,
            "detection_method": detect_result.get("detection_method"),
            "segments_count": len(segments),
            "captured_bytes": capture_session.total_bytes if capture_session else None,
        }
        logger.info("AUDIO_ANALYSIS: %s", json.dumps(analysis_log))

        if detect_result["is_hold"]:
            from app.models.action_history import ActionHistory, ActionType  # noqa: PLC0415

            conf.state.hold_detected = True
            conf.state.action_history.append(ActionHistory(
                timestamp=datetime.now(timezone.utc).isoformat(),
                action_type=ActionType.SYSTEM_AUDIO_ANALYSIS,
                metadata=analysis_log,
                owner="system",
            ))
            conf.state.action_history.append(ActionHistory(
                timestamp=datetime.now(timezone.utc).isoformat(),
                action_type=ActionType.SYSTEM_HOLD_DETECTED,
                metadata={"conference_id": conference_id, "status": "hold_detected", "scope": "conference"},
                owner="system",
            ))
            await conf.update_state()
            logger.warning("HOLD DETECTED | Score: %.2f", detect_result["score"])

    except Exception as exc:
        logger.exception("audio_processor: error processing chunk — %s", exc)


async def handle_incoming_message(
    msg: dict[str, Any],
    conf: Any,
    transcriber: Optional[Any],
    hold_detector: Optional[Any],
    conference_id: str,
    capture_session: Optional[Any] = None,
) -> bool:
    """Handle a raw WebSocket message dict.  Returns False when the caller should stop."""
    if msg.get("type") == "websocket.disconnect":
        logger.info("websocket: client disconnected for %s", conference_id)
        conf.set_websocket(None)
        return False

    if "bytes" in msg and msg["bytes"] is not None:
        # SECURITY: audio bytes are NEVER logged
        if capture_session:
            try:
                capture_session.write_chunk(msg["bytes"])
            except Exception as exc:
                logger.exception("websocket: capture error — %s", exc)
        if transcriber and hold_detector:
            await process_audio_message(
                msg["bytes"], conf, transcriber, hold_detector, conference_id, capture_session
            )
    elif "text" in msg and msg["text"] is not None:
        logger.info("websocket: text message for %s", conference_id)
    return True
