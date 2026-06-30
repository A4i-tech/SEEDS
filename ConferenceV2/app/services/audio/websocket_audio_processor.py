import json
import os
from collections import deque
from datetime import datetime, timezone
from typing import Any, Optional

from app.conf_logger import logger_instance
from app.models.action_history import ActionHistory, ActionType
from app.services.audio.audio_capture import AudioCaptureService
from app.services.audio.hold_detector import HoldDetector
from app.services.audio.transcriber import AudioTranscriber
from app.services.conference_call import ConferenceCall

TRANSCRIPT_WINDOW_SIZE = 3

_transcript_logging = os.getenv("AUDIO_TRANSCRIPT_LOGGING_ENABLED", "false").lower() == "true"


def _mask_audio_text(text: str | None) -> str:
    """Redact transcript/speech text for safe logging."""
    if not text:
        return "<empty>"
    return f"<redacted len={len(text)}>"


def _remember_transcript(conf: ConferenceCall, text: str) -> str:
    # Keep a short rolling transcript so hold detection has enough context
    # without coupling stateful logic back into the websocket router.
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
    conf: ConferenceCall,
    transcriber: AudioTranscriber,
    hold_detector: HoldDetector,
    conference_id: str,
    capture_session: Optional[AudioCaptureService] = None,
) -> None:
    # Run transcription/hold detection for a single binary websocket frame.
    try:
        result = await transcriber.process_chunk(audio_bytes)
        if not result:
            return

        text = result["text"]
        segments = result.get("segments", [])
        analysis_text = _remember_transcript(conf, text)
        detect_result = await hold_detector.detect(analysis_text)

        _safe_text = text if _transcript_logging else _mask_audio_text(text)
        _safe_analysis = analysis_text if _transcript_logging else _mask_audio_text(analysis_text)
        _safe_matched = detect_result.get("matched_phrase") if _transcript_logging else _mask_audio_text(detect_result.get("matched_phrase"))

        analysis_log = {
            "event": "audio_analysis",
            "conference_id": conference_id,
            "text": _safe_text,
            "analysis_text": _safe_analysis,
            "is_hold": detect_result["is_hold"],
            "hold_score": float(f"{detect_result['score']:.4f}"),
            "hold_threshold": detect_result.get("threshold"),
            "matched_phrase": _safe_matched,
            "detection_method": detect_result.get("detection_method"),
            "segments_count": len(segments),
            "captured_bytes": capture_session.total_bytes if capture_session else None,
        }
        logger_instance.info(f"AUDIO_ANALYSIS: {json.dumps(analysis_log)}")

        if detect_result["is_hold"]:
            # Conference-level hold indication for later analytics/debugging/UI.
            conf.state.hold_detected = True
            conf.state.action_history.append(
                ActionHistory(
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    action_type=ActionType.SYSTEM_AUDIO_ANALYSIS,
                    metadata=analysis_log,
                    owner="system",
                )
            )
            conf.state.action_history.append(
                ActionHistory(
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    action_type=ActionType.SYSTEM_HOLD_DETECTED,
                    metadata={
                        "conference_id": conference_id,
                        "status": "hold_detected",
                        "scope": "conference",
                    },
                    owner="system",
                )
            )
            await conf.update_state()

            logger_instance.warning(
                f"HOLD DETECTED | Score: {detect_result['score']:.2f} | Text: {_safe_analysis}"
            )
    except Exception as e:
        logger_instance.exception("Error processing audio chunk: %s", e)


async def handle_incoming_message(
    msg: dict[str, Any],
    conf: ConferenceCall,
    transcriber: Optional[AudioTranscriber],
    hold_detector: Optional[HoldDetector],
    conference_id: str,
    capture_session: Optional[AudioCaptureService] = None,
) -> bool:
    # Return False when the caller should stop the websocket receive loop.
    if msg.get("type") == "websocket.disconnect":
        logger_instance.info(f"WebSocket Client disconnected for {conference_id}")
        conf.set_websocket(None)
        return False

    if "bytes" in msg and msg["bytes"] is not None:
        if capture_session:
            try:
                capture_session.write_chunk(msg["bytes"])
            except Exception as e:
                logger_instance.exception("Error capturing audio chunk: %s", e)

        if transcriber and hold_detector:
            await process_audio_message(
                msg["bytes"],
                conf,
                transcriber,
                hold_detector,
                conference_id,
                capture_session,
            )
    elif "text" in msg and msg["text"] is not None:
        logger_instance.info(
            f"RECEIVED WEBSOCKET MSG for conf ID: {conference_id} Message: {msg['text']}"
        )

    return True
