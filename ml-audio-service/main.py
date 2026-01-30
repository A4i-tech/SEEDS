import asyncio
import logging
import json
from fastapi import FastAPI, WebSocket, WebSocketDisconnect

from transcriber import AudioTranscriber
from hold_detector import HoldDetector
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logging.getLogger("httpcore").setLevel(logging.WARNING)
logging.getLogger("httpx").setLevel(logging.WARNING)
logging.getLogger("openai").setLevel(logging.WARNING)
logger = logging.getLogger("ml-audio-service")
logger.setLevel(logging.DEBUG)

app = FastAPI()
transcriber = AudioTranscriber() 
hold_detector = HoldDetector()

@app.websocket("/stream/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    await websocket.accept()
    logger.info(f"Connection accepted from {client_id}")
    try:
        while True:
            # Receive audio chunk
            data = await websocket.receive_bytes()
            
            # Process audio chunk
            result = await transcriber.process_chunk(data)
            
            if result:
                transcription = result["text"]
                duration = result["duration"]
                
                detect_result = hold_detector.detect(transcription)
                is_hold = detect_result["is_hold"]
                score = detect_result["score"]
                
                response = {
                    "text": transcription,
                    "duration": duration,
                    "is_hold": is_hold,
                    "hold_score": round(score, 4)
                }
                
                if is_hold:
                    logger.warning(f"HOLD DETECTED for {client_id} | Score: {score:.2f} | Text: {transcription}")
                
                await websocket.send_text(json.dumps(response))
            
    except WebSocketDisconnect:
        logger.info(f"Client {client_id} disconnected")
    except Exception as e:
        logger.error(f"Error processing stream for {client_id}: {e}")
