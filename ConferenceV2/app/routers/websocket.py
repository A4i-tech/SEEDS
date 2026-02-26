# routers/conference.py

import asyncio
import json
import os
from datetime import datetime, timezone
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Any, Optional
from app.conf_logger import logger_instance

from app.routers.conference import conference_manager
from app.models.action_history import ActionHistory, ActionType
from app.services.conference_call import ConferenceCall
from app.services.audio.capture import AudioCaptureSession
from app.services.audio.transcriber import AudioTranscriber
from app.services.audio.hold_detector import HoldDetector
from app.services.confevents.hold_detected_event import HoldDetectedEvent
from app.models.participant import CallStatus, Role

router = APIRouter()

# Singleton instance for HoldDetector to cache embeddings across connections
_hold_detector_instance: Optional[HoldDetector] = None
_hold_detector_lock = asyncio.Lock()

async def get_hold_detector() -> HoldDetector:
    global _hold_detector_instance
    if _hold_detector_instance is None:
        async with _hold_detector_lock:
            if _hold_detector_instance is None:
                _hold_detector_instance = await HoldDetector.create()
    return _hold_detector_instance

async def process_audio_message(
    audio_bytes: bytes,
    conf: ConferenceCall,
    transcriber: AudioTranscriber,
    hold_detector: HoldDetector,
    conference_id: str,
    capture_session: Optional[AudioCaptureSession] = None,
) -> None:
    """
    Process audio chunk through transcriber and hold detector.
    """
    try:
        result = await transcriber.process_chunk(audio_bytes)
        
        if result:
            text = result["text"]
            segments = result.get("segments", [])
            
            detect_result = await hold_detector.detect(text)
            
            # Structured Log
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

            await persist_analysis_if_needed(conf, analysis_log, bool(detect_result["is_hold"]))

            if detect_result["is_hold"]:
                logger_instance.warning(f"HOLD DETECTED | Score: {detect_result['score']:.2f} | Text: {text}")
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


async def persist_analysis_if_needed(
    conf: ConferenceCall, analysis_log: dict[str, Any], is_hold: bool
) -> None:
    if not is_hold:
        return

    if os.getenv("AUDIO_ANALYSIS_DB_LOGGING_ENABLED", "false").lower() != "true":
        return

    conf.state.action_history.append(
        ActionHistory(
            timestamp=datetime.now(timezone.utc).isoformat(),
            action_type=ActionType.SYSTEM_AUDIO_ANALYSIS,
            metadata=analysis_log,
            owner="system",
        )
    )
    await conf.storage_manager.save_state(
        conf.conf_id, conf.state.model_dump(by_alias=True)
    )


def select_hold_participant(conf: ConferenceCall) -> str | None:
    students = [
        participant
        for participant in conf.state.participants.values()
        if participant.role == Role.STUDENT
        and participant.call_status
        in {CallStatus.CONNECTED, CallStatus.CONNECTING, CallStatus.ON_HOLD}
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
    """
    Handle a single WebSocket message. Returns False if disconnection is requested.
    """
    if msg.get("type") == "websocket.disconnect":
        logger_instance.info(f"WebSocket Client disconnected for {conference_id}")
        conf.set_websocket(None)
        return False

    # Handle binary (audio) messages
    if "bytes" in msg and msg["bytes"] is not None:
        if capture_session:
            try:
                capture_session.write_chunk(msg["bytes"])
            except Exception as e:
                logger_instance.exception("Error capturing audio chunk: %s", e)

        if transcriber and hold_detector:
            # Fire and forget audio processing to avoid blocking the loop? 
            # Or await to ensure order? Order matters for transcription context.
            await process_audio_message(
                msg["bytes"],
                conf,
                transcriber,
                hold_detector,
                conference_id,
                capture_session,
            )

    # Handle text messages
    elif "text" in msg and msg["text"] is not None:
        logger_instance.info(f"RECEIVED WEBSOCKET MSG for conf ID: {conference_id} Message: {msg['text']}")

    return True

@router.websocket("/{conference_id}")
async def websocket_endpoint(websocket: WebSocket, conference_id: str):
    conf = conference_manager.get_conference(conference_id)
    if conf:
        await websocket.accept()
        conf.set_websocket(websocket)
        logger_instance.info(f"WEBSOCKET ACCEPTED FOR CONF: {conference_id}")
        
        # Initialize Audio Services
        transcriber: Optional[AudioTranscriber] = None
        hold_detector: Optional[HoldDetector] = None
        capture_session: Optional[AudioCaptureSession] = None
        audio_analysis_enabled = (
            os.getenv("AUDIO_ANALYSIS_ENABLED", "true").lower() == "true"
        )
        
        try:
            transcriber = AudioTranscriber()
            logger_instance.info(f"Audio transcriber initialized for {conference_id}")
        except Exception as e:
            logger_instance.error(f"Failed to initialize AudioTranscriber: {e}")

        if audio_analysis_enabled:
            try:
                hold_detector = await get_hold_detector()
                logger_instance.info(f"Hold detector initialized for {conference_id}")
            except Exception as e:
                logger_instance.error(f"Failed to initialize HoldDetector: {e}")
        else:
            logger_instance.info(
                f"AUDIO_ANALYSIS_ENABLED=false; skipping hold detector init for {conference_id}"
            )

        if os.getenv("AUDIO_CAPTURE_ENABLED", "false").lower() == "true":
            try:
                capture_session = AudioCaptureSession(conference_id)
                logger_instance.info(
                    f"Audio capture enabled for {conference_id}. Output: {capture_session.file_path}"
                )
            except Exception as e:
                logger_instance.error(f"Failed to initialize audio capture for {conference_id}: {e}")

        try:
            while True:
                msg = await websocket.receive()
                should_continue = await handle_incoming_message(
                    msg,
                    conf,
                    transcriber,
                    hold_detector,
                    conference_id,
                    capture_session,
                )
                if not should_continue:
                    break
                    
        except WebSocketDisconnect:
            logger_instance.info(f"WebSocket Client disconnected (WebSocketDisconnect) for {conference_id}")
        except Exception as e:
            logger_instance.exception("An error occurred in websocket loop: %s", e)
        finally:
            if capture_session:
                uploaded_url = await capture_session.finalize()
                if uploaded_url:
                    logger_instance.info(
                        f"Captured audio uploaded for {conference_id}: {uploaded_url}"
                    )
            conf.set_websocket(None)
