import json
import os
from datetime import datetime, timezone
from typing import Any, Optional

from app.conf_logger import logger_instance
from app.models.action_history import ActionHistory, ActionType
from app.models.participant import CallStatus, Role
from app.services.audio.capture import AudioCaptureSession
from app.services.audio.hold_detector import HoldDetector
from app.services.audio.transcriber import AudioTranscriber
from app.services.conference_call import ConferenceCall
from app.services.confevents.hold_detected_event import HoldDetectedEvent


async def process_audio_message(
    audio_bytes: bytes,
    conf: ConferenceCall,
    transcriber: AudioTranscriber,
    hold_detector: HoldDetector,
    conference_id: str,
    capture_session: Optional[AudioCaptureSession] = None,
) -> None:
    try:
        result = await transcriber.process_chunk(audio_bytes)
        if not result:
            return

        text = result["text"]
        segments = result.get("segments", [])
        detect_result = await hold_detector.detect(text)

        analysis_log = {
            "event": "audio_analysis",
            "conference_id": conference_id,
            "text": text,
            "is_hold": detect_result["is_hold"],
            "hold_score": float(f"{detect_result['score']:.4f}"),
            "hold_threshold": detect_result.get("threshold"),
            "matched_phrase": detect_result.get("matched_phrase"),
            "detection_method": detect_result.get("detection_method"),
            "segments_count": len(segments),
            "captured_bytes": capture_session.total_bytes if capture_session else None,
        }
        logger_instance.info(f"AUDIO_ANALYSIS: {json.dumps(analysis_log)}")

        if detect_result["is_hold"]:
            # Conference-level hold indication for later analytics/debugging.
            conf.state.action_history.append(
                ActionHistory(
                    timestamp=datetime.now(timezone.utc).isoformat(),
                    action_type=ActionType.SYSTEM_AUDIO_ANALYSIS,
                    metadata=analysis_log,
                    owner="system",
                )
            )
            await conf.storage_manager.save_state(conf.conf_id, conf.state.model_dump(by_alias=True))

            logger_instance.warning(
                f"HOLD DETECTED | Score: {detect_result['score']:.2f} | Text: {text}"
            )
            phone_number = select_hold_participant(conf)
            if phone_number:
                await conf.queue_event(HoldDetectedEvent(phone_number=phone_number, conf_call=conf))
            else:
                logger_instance.warning(
                    "HOLD DETECTED but no eligible student found for conference %s",
                    conference_id,
                )
    except Exception as e:
        logger_instance.exception("Error processing audio chunk: %s", e)


def select_hold_participant(conf: ConferenceCall) -> str | None:
    students = [
        participant
        for participant in conf.state.participants.values()
        if participant.role == Role.STUDENT
        and participant.call_status in {CallStatus.CONNECTED, CallStatus.CONNECTING, CallStatus.ON_HOLD}
    ]

    if not students:
        return None

    existing_hold = next(
        (participant for participant in students if participant.call_status == CallStatus.ON_HOLD),
        None,
    )
    if existing_hold:
        return existing_hold.phone_number

    if len(students) == 1:
        return students[0].phone_number

    connected_students = [
        participant for participant in students if participant.call_status == CallStatus.CONNECTED
    ]
    if len(connected_students) == 1:
        return connected_students[0].phone_number

    return None


async def handle_incoming_message(
    msg: dict[str, Any],
    conf: ConferenceCall,
    transcriber: Optional[AudioTranscriber],
    hold_detector: Optional[HoldDetector],
    conference_id: str,
    capture_session: Optional[AudioCaptureSession] = None,
) -> bool:
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
