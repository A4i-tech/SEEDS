"""
WebSocket endpoint for receiving real-time audio streams from Vonage.

Vonage sends PCM audio frames via WebSocket which we analyze for hold detection.
"""

import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import os
from typing import Dict
from app.conf_logger import logger_instance
from app.services.audio_stream_analyzer import AudioStreamAnalyzer
from app.services.singletons.conference_call_manager import conference_manager
from app.services.confevents.mute_participant_event import MuteParticipantEvent
from app.services.confevents.unmute_participant_event import UnmuteParticipantEvent

router = APIRouter()

# Track active audio analyzers per participant
audio_analyzers: Dict[str, AudioStreamAnalyzer] = {}


@router.websocket("/audio-stream/{conference_id}/{phone_number}")
async def audio_stream_websocket(
    websocket: WebSocket, conference_id: str, phone_number: str
):
    """
    WebSocket endpoint to receive real-time PCM audio from Vonage.

    Vonage NCCO connects each participant's audio here for analysis.
    We detect hold events by analyzing RTP artifacts before announcements play.
    """
    await websocket.accept()

    logger_instance.info(
        f"[AUDIO STREAM] WebSocket connected for {phone_number} in conference {conference_id}"
    )
    print(
        f"\n[AUDIO STREAM] 🎧 Started audio monitoring\n"
        f"  Conference: {conference_id}\n"
        f"  Participant: {phone_number}\n"
    )

    # Get conference instance
    conf = conference_manager.get_conference(conference_id)
    if not conf:
        logger_instance.error(
            f"[AUDIO STREAM] Conference {conference_id} not found for {phone_number}"
        )
        await websocket.close()
        return

    # Create hold detection callback (kept for compatibility; actions now enqueued below)
    async def on_hold_detected(reason: str):
        logger_instance.info(
            f"[AUDIO STREAM] 🚨 HOLD DETECTED for {phone_number} - Reason: {reason}"
        )

    # Initialize audio analyzer for this participant
    analyzer = AudioStreamAnalyzer(phone_number, on_hold_detected)
    audio_analyzers[phone_number] = analyzer

    # Feature flag: enable/disable automatic mute on hold/music detection
    auto_hold_mute_enabled = os.getenv("AUTO_HOLD_MUTE_ENABLED", "true").lower() in (
        "1",
        "true",
        "yes",
    )

    try:
        while True:
            # Receive audio frame from Vonage
            message = await websocket.receive()

            if "bytes" in message:
                # Binary PCM audio data
                pcm_chunk = message["bytes"]

                # Analyze frame for hold detection
                decision = analyzer.analyze_pcm_frame(pcm_chunk)

                if decision and auto_hold_mute_enabled:
                    action, reason = decision

                    # Never auto-mute the teacher
                    teacher_phone = (
                        conf.state.get_teacher().phone_number
                        if conf.state.get_teacher()
                        else None
                    )
                    if phone_number == teacher_phone:
                        continue

                    if action == "mute":
                        logger_instance.info(
                            f"[AUDIO STREAM] 🚨 Auto-mute triggered for {phone_number} - {reason}"
                        )
                        try:
                            await conf.queue_event(
                                MuteParticipantEvent(
                                    phone_number=phone_number,
                                    conf_call=conf,
                                    stream_system_message=False,
                                )
                            )
                        except Exception as e:
                            logger_instance.error(
                                f"[AUDIO STREAM] Error enqueuing auto-mute: {e}"
                            )
                    elif action == "unmute":
                        logger_instance.info(
                            f"[AUDIO STREAM] ✅ Auto-unmute triggered for {phone_number} - {reason}"
                        )
                        try:
                            await conf.queue_event(
                                UnmuteParticipantEvent(
                                    phone_number=phone_number, conf_call=conf
                                )
                            )
                        except Exception as e:
                            logger_instance.error(
                                f"[AUDIO STREAM] Error enqueuing auto-unmute: {e}"
                            )

            elif "text" in message:
                # JSON metadata from Vonage (call events, etc.)
                try:
                    data = json.loads(message["text"])
                    logger_instance.info(f"[AUDIO STREAM] Metadata: {data}")

                    # Handle Vonage audio stream events
                    if data.get("event") == "start":
                        print(
                            f"[AUDIO STREAM] 🎤 Audio stream started for {phone_number}"
                        )
                    elif data.get("event") == "stop":
                        print(
                            f"[AUDIO STREAM] 🛑 Audio stream stopped for {phone_number}"
                        )
                        break

                except json.JSONDecodeError:
                    pass

    except WebSocketDisconnect:
        logger_instance.info(
            f"[AUDIO STREAM] WebSocket disconnected for {phone_number}"
        )
        print(f"[AUDIO STREAM] 🔌 Disconnected: {phone_number}")

    except Exception as e:
        logger_instance.error(f"[AUDIO STREAM] Error in audio stream: {e}")
        print(f"[AUDIO STREAM] ❌ Error: {e}")

    finally:
        # Cleanup
        if phone_number in audio_analyzers:
            del audio_analyzers[phone_number]

        await websocket.close()
        logger_instance.info(f"[AUDIO STREAM] Closed audio stream for {phone_number}")


@router.post("/audio-stream-unearmuff/{phone_number}")
async def unearmuff_on_return(phone_number: str):
    """
    API endpoint to unearmuff participant when they return from hold.

    Called when participant returns to CONNECTED status after hold.
    """
    logger_instance.info(f"[AUDIO STREAM] Unearmuff request for {phone_number}")

    # Reset analyzer if exists
    if phone_number in audio_analyzers:
        audio_analyzers[phone_number].reset()

    return {"status": "ok", "phone_number": phone_number}
