# routers/conference.py

import asyncio
import json
import traceback
import uuid
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from typing import List, Optional
from app.conf_logger import logger_instance

from app.routers.conference import conference_manager
from app.services.audio.transcriber import AudioTranscriber
from app.services.audio.hold_detector import HoldDetector

router = APIRouter()

# Singleton instance for HoldDetector to cache embeddings across connections
_hold_detector_instance: Optional[HoldDetector] = None

async def get_hold_detector() -> HoldDetector:
    global _hold_detector_instance
    if _hold_detector_instance is None:
        _hold_detector_instance = await HoldDetector.create()
    return _hold_detector_instance

# TODO: CLOSE WEBSOCKET CONNECTION WHEN CONF ENDS
@router.websocket("/{conference_id}")
async def websocket_endpoint(websocket: WebSocket, conference_id: str):
    conf = conference_manager.get_conference(conference_id)
    if conf:
        await websocket.accept()
        conf.set_websocket(websocket)
        logger_instance.info(f"WEBSOCKET ACCEPTED FOR CONF: {conference_id}")
        
        # Initialize Audio Services
        try:
            transcriber = AudioTranscriber()
            hold_detector = await get_hold_detector()
            logger_instance.info(f"Audio Services Initialized for {conference_id}")
        except Exception as e:
            logger_instance.error(f"Failed to initialize Audio Services: {e}")
            transcriber = None
            hold_detector = None
            # Consider closing connection or continuing without ML?
            # For now, we continue but ML will be skipped.

        try:
            while True:
                msg = await websocket.receive()
                
                if msg['type'] == 'websocket.disconnect':
                    logger_instance.info(f"WebSocket Client disconnected for {conference_id}")
                    conf.set_websocket(None)
                    break

                # Handle binary (audio) messages
                if "bytes" in msg and msg["bytes"] is not None:
                    if transcriber and hold_detector:
                        await process_audio_message(msg["bytes"], transcriber, hold_detector, conference_id)

                # Handle text messages
                elif "text" in msg and msg["text"] is not None:
                    logger_instance.info(f"RECEIVED WEBSOCKET MSG for conf ID: {conference_id} Message: {msg['text']}")
                    
        except WebSocketDisconnect:
            logger_instance.info(f"WebSocket Client disconnected (WebSocketDisconnect) for {conference_id}")
        except Exception as e:
            logger_instance.error(f"An error occurred in websocket loop: {e}")
            traceback.print_exc()
        finally:
             conf.set_websocket(None)

async def process_audio_message(audio_bytes: bytes, transcriber: AudioTranscriber, hold_detector: HoldDetector, conference_id: str):
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
                "segments_count": len(segments)
            }
            logger_instance.info(f"AUDIO_ANALYSIS: {json.dumps(analysis_log)}")

            if detect_result["is_hold"]:
                logger_instance.warning(f"HOLD DETECTED | Score: {detect_result['score']:.2f} | Text: {text}")
    except Exception as e:
        logger_instance.error(f"Error processing audio chunk: {e}")
