# routers/conference.py

import asyncio
import json
import traceback
import uuid
from fastapi import APIRouter, Request, WebSocket, WebSocketDisconnect
from typing import List
from app.conf_logger import logger_instance

from app.routers.conference import conference_manager

router = APIRouter()
# settings = get_settings()

# TODO: CLOSE WEBSOCKET CONNECTION WHEN CONF ENDS
@router.websocket("/{conference_id}")
async def websocket_endpoint(websocket: WebSocket, conference_id: str):
    conf = conference_manager.get_conference(conference_id)
    if conf:
        await websocket.accept()
        conf.set_websocket(websocket)
        logger_instance.info("WEBSOCKET ACCEPTED FOR CONF: ", conference_id)
        
        # Initialize Audio Services
        try:
            from app.services.audio.transcriber import AudioTranscriber
            from app.services.audio.hold_detector import HoldDetector
            transcriber = AudioTranscriber()
            hold_detector = HoldDetector()
            logger_instance.info("Audio Services Initialized for ", conference_id)
        except Exception as e:
            logger_instance.error(f"Failed to initialize Audio Services: {e}")
            transcriber = None
            hold_detector = None

        try:
            while True:
                try:
                    msg = await websocket.receive()
                    
                    if msg['type'] == 'websocket.disconnect':
                        logger_instance.info(f"WebSocket Client disconnected for {conference_id}")
                        conf.set_websocket(None)
                        break

                    # Handle binary (audio) messages
                    if "bytes" in msg and msg["bytes"] is not None:
                        if transcriber and hold_detector:
                            result = await transcriber.process_chunk(msg["bytes"])
                            
                            if result:
                                text = result["text"]
                                segments = result.get("segments", [])
                                # duration = result["duration"]
                                
                                detect_result = await hold_detector.detect(text)
                                
                                # Log full analysis details
                                analysis_log = {
                                    "text": text,
                                    "is_hold": detect_result["is_hold"],
                                    "hold_score": float(f"{detect_result['score']:.4f}"),
                                    "segments": segments
                                }
                                logger_instance.info(f"AUDIO ANALYSIS: {json.dumps(analysis_log)}")

                                if detect_result["is_hold"]:
                                    logger_instance.warning(f"HOLD DETECTED | Score: {detect_result['score']:.2f} | Text: {text}")

                    # Handle text messages
                    elif "text" in msg and msg["text"] is not None:
                        logger_instance.info('RECEIVED WEBSOCKET MSG for conf ID: ', conference_id, " Message: ", msg["text"])
                        
                except WebSocketDisconnect:
                    logger_instance.info(f"WebSocket Client disconnected for {conference_id}")
                    conf.set_websocket(None)
                    break 
                except Exception as e:
                    logger_instance.info(f"An error occurred while receiving message: {e}")
                    traceback.print_exc()
                    conf.set_websocket(None)
                    break
        except Exception as e:
            logger_instance.info(f"An error occurred in websocket router: {e}")
            traceback.print_exc()
            conf.set_websocket(None)
    
