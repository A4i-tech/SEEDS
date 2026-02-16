# routers/conference.py

import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from typing import Any, Optional
from app.conf_logger import logger_instance

from app.routers.conference import conference_manager
from app.services.audio.audio_capture import AudioCaptureService
from app.services.audio.transcriber import AudioTranscriber
from app.services.audio.hold_detector import HoldDetector
from app.services.audio.websocket_audio_processor import handle_incoming_message
from config import get_settings

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

@router.websocket("/{conference_id}")
async def websocket_endpoint(websocket: WebSocket, conference_id: str):
    conf = conference_manager.get_conference(conference_id)
    if conf:
        settings = get_settings()
        await websocket.accept()
        conf.set_websocket(websocket)
        logger_instance.info(f"WEBSOCKET ACCEPTED FOR CONF: {conference_id}")
        
        # Initialize Audio Services
        transcriber: Optional[AudioTranscriber] = None
        hold_detector: Optional[HoldDetector] = None
        capture_session: Optional[AudioCaptureService] = None
        audio_analysis_enabled = settings.AUDIO_ANALYSIS_ENABLED
        
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

        if settings.AUDIO_CAPTURE_ENABLED:
            try:
                capture_session = AudioCaptureService(conference_id, settings=settings)
                logger_instance.info(f"Audio capture enabled for {conference_id}")
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
