# services/conference_call.py

import traceback
from typing import List
from datetime import datetime
import asyncio

from fastapi import WebSocket
from app.models.conference_call_state import ConferenceCallState
from app.models.system_audio_messages import SystemAudioMessages
from app.services.confevents.base_event import ConferenceEvent
from app.models.participant import Participant, Role, CallStatus
from app.models.action_history import ActionHistory, ActionType
from app.services.communication_api import CommunicationAPI
from app.services.storage_manager import StorageManager 
from app.services.smartphone_connection_manager import SmartphoneConnectionManager
from app.conf_logger import logger_instance
from app.services.stream_system_messages import StreamSystemMessages
from config import get_settings


class ConferenceCall:
    def __init__(
        self,
        conf_id: str,
        communication_api: CommunicationAPI,
        storage_manager: StorageManager,
        connection_manager: SmartphoneConnectionManager,
    ):
        self.conf_id = conf_id
        self.communication_api = communication_api
        self.storage_manager = storage_manager
        self.connection_manager = connection_manager
        self.state = ConferenceCallState()
        self._system_message_streaming_service = StreamSystemMessages(conf_id=conf_id)
        
        self.event_queue = asyncio.Queue()
        self.event_queue_processing_task: asyncio.Task | None = None

        # Remote audio relay (websocket-service → hold detection pipeline)
        self._remote_audio_queue: asyncio.Queue | None = None
        self._remote_audio_task: asyncio.Task | None = None
    
    async def stream_system_message(self, message: SystemAudioMessages) -> None:
        if self.state.is_running and self.communication_api.get_is_websocket_connected():
            await self._system_message_streaming_service.stream_message(message)
    
    async def queue_event(self, event: ConferenceEvent) -> None:
        await self.event_queue.put(event)
    
    def end_processing_conf_events_from_queue(self) -> None:
        if self.event_queue_processing_task is not None:
            self.event_queue_processing_task.cancel()
    
    def start_processing_conf_events_from_queue(self) -> None:
        self.end_processing_conf_events_from_queue()
        self.event_queue_processing_task = asyncio.create_task(self.__process_conf_events_queue())
    
    def set_participant_state(self, teacher_phone: str, student_phones: List[str]) -> None:
        self.state.participants = {}
        teacher = Participant(
            name="Teacher",
            phone_number=teacher_phone,
            role=Role.TEACHER,
            call_status=CallStatus.DISCONNECTED,
        )
        self.state.participants[teacher_phone] = teacher
        self.state.teacher_phone_number = teacher_phone

        # Create student participants (muted by default via Vonage startMuted)
        for phone in student_phones:
            student = Participant(
                name="Student",
                phone_number=phone,
                role=Role.STUDENT,
                call_status=CallStatus.DISCONNECTED,
                is_muted=True,  # Students start muted at Vonage API level
            )
            self.state.participants[phone] = student
    
    async def close_websocket(self) -> None:
        if hasattr(self, "_websocket") and self._websocket:
            try:
                await self._websocket.close()
                logger_instance.info(f"Closed WebSocket for conference {self.conf_id}")
            except Exception as e:
                logger_instance.warning(f"Error closing WebSocket for conference {self.conf_id}: {e}")
            finally:
                self._websocket = None

    def set_websocket(self, websocket: WebSocket | None) -> None:
        self._websocket = websocket

    def start_remote_audio_relay(self) -> None:
        """Start consuming audio from the remote relay queue (websocket-service)."""
        settings = get_settings()
        if not settings.AUDIO_ANALYSIS_ENABLED:
            logger_instance.info(
                f"AUDIO_ANALYSIS_ENABLED=false; skipping remote audio relay for {self.conf_id}"
            )
            return
        self.stop_remote_audio_relay()
        self._remote_audio_queue = asyncio.Queue()
        self._remote_audio_task = asyncio.create_task(self._consume_remote_audio())
        logger_instance.info(f"Remote audio relay queue created for {self.conf_id}")

    def stop_remote_audio_relay(self) -> None:
        if self._remote_audio_task is not None:
            self._remote_audio_task.cancel()
            self._remote_audio_task = None
        self._remote_audio_queue = None

    async def _consume_remote_audio(self) -> None:
        """Background task: pull audio bytes from the relay queue and run hold detection."""
        from app.services.audio.hold_detector import HoldDetector
        from app.services.audio.transcriber import AudioTranscriber
        from app.services.audio.websocket_audio_processor import process_audio_message

        transcriber: AudioTranscriber | None = None
        hold_detector: HoldDetector | None = None
        try:
            logger_instance.info(f"Initializing remote audio pipeline for {self.conf_id}...")
            transcriber = AudioTranscriber()
            logger_instance.info(f"AudioTranscriber initialized for remote relay ({self.conf_id})")
            hold_detector = await HoldDetector.create()
            logger_instance.info(f"Remote audio relay started for {self.conf_id}")
        except Exception as e:
            logger_instance.error(f"Failed to init audio pipeline for remote relay ({self.conf_id}): {e}")
            return

        try:
            while True:
                audio_bytes = await self._remote_audio_queue.get()
                await process_audio_message(
                    audio_bytes, self, transcriber, hold_detector, self.conf_id
                )
        except asyncio.CancelledError:
            logger_instance.info(f"Remote audio relay stopped for {self.conf_id}")
        except Exception as e:
            logger_instance.exception(f"Remote audio relay error for {self.conf_id}: {e}")

    async def start_conference(self) -> None:
        # Start the call via communication API
        await self.communication_api.start_conf(
            self.state.teacher_phone_number, 
            [student.phone_number for student in self.state.get_students()]
        )
        self.state.is_running = True
        self.state.hold_detected = False
        # TODO: Set CONNECTED CALL STATUS WHEN ATLEAST ONE OF THE PARTICIPANTS HAVE PICKED UP
        self.state.action_history.append(ActionHistory(
                                                    timestamp=datetime.now().isoformat(), 
                                                    action_type=ActionType.CONFERENCE_START, 
                                                    metadata={
                                                        "teacher_phone": self.state.teacher_phone_number,
                                                        "student_phones": [student.phone_number for student in self.state.get_students()]
                                                    }, 
                                                    owner=self.state.teacher_phone_number
                                                 )
                                    )
        # Update state and save
        await self.update_state()
    
    async def connect_smartphone(self):
        teacher = self.state.get_teacher()
        if teacher:
            return await self.connection_manager.connect(client=teacher)
        raise ValueError("No teacher participant in conf call " + self.conf_id)
    
    async def disconnect_smartphone(self):
        teacher = self.state.get_teacher()
        if teacher:
            return await self.connection_manager.disconnect(client=teacher)
        raise ValueError("No teacher participant in conf call " + self.conf_id)
        
    async def update_state(self) -> None:
        # Save state to storage
        await self.storage_manager.save_state(self.conf_id, self.state.model_dump(by_alias=True))
        # Notify clients
        await self.connection_manager.send_message_to_client(client=self.state.get_teacher(),
                                                             message=self.state.model_dump(by_alias=True))
    
    async def on_websocket_disconnect_callback(self) -> None:
        await self.communication_api.reconnect_websocket()
    
    # Dequeue function: runs continuously to process tasks
    async def __process_conf_events_queue(self, timeout: float = 3.0) -> None:
        while True:
            event: ConferenceEvent = await self.event_queue.get()
            try:
                # Attempt to execute the event with a timeout
                await asyncio.wait_for(event.execute_event(), timeout=timeout)
            except asyncio.TimeoutError:
                # Handle the timeout (e.g., log a warning, skip, etc.)
                logger_instance.info(f"Event {event} execution timed out and was skipped.")
            except Exception as e:
                logger_instance.error(f"Error executing event {event} : ", e)
                traceback_str = ''.join(traceback.format_tb(e.__traceback__))
                logger_instance.error("Traceback:\n%s", traceback_str)
            finally:
                # Mark the task as done to release the queue item
                self.event_queue.task_done()
    

        
