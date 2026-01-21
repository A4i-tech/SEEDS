# services/conference_call.py

import traceback
from typing import List, Optional
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
# from services.vanilla_websocket_service import VanillaWebSocketService


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
        # self.websocket_service = VanillaWebSocketService(
        #         on_disconnect_callback=self.__on_websocket_disconnect_callback,
        #         audio_content_state=self.state.audio_content_state,
        #         on_state_update=self.update_state
        #     )
        
        self.event_queue = asyncio.Queue()
        self.event_queue_processing_task: Optional[asyncio.Task] = None
        # Initialize state timestamps if not set
        if not self.state.created_at:
            self.state.created_at = datetime.now().isoformat()
        if not self.state.last_activity_at:
            self.state.last_activity_at = datetime.now().isoformat()
    
    async def stream_system_message(self, message: SystemAudioMessages):
        if self.state.is_running and self.communication_api.get_is_websocket_connected():
            await self._system_message_streaming_service.stream_message(message)
    
    async def queue_event(self, event: ConferenceEvent):
        await self.event_queue.put(event)
    
    def end_processing_conf_events_from_queue(self):
        if self.event_queue_processing_task != None:
            self.event_queue_processing_task.cancel()
    
    def start_processing_conf_events_from_queue(self):
        self.end_processing_conf_events_from_queue()
        self.event_queue_processing_task = asyncio.create_task(self.__process_conf_events_queue())
    
    def set_participant_state(self, teacher_phone: str, student_phones: List[str]):
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
    
    # def set_websocket(self, websocket: WebSocket):
    #     self.websocket_service.set_websocket(websocket)

    async def start_conference(self):
        # Start the call via communication API
        await self.communication_api.start_conf(
            self.state.teacher_phone_number, 
            [student.phone_number for student in self.state.get_students()]
        )
        self.state.is_running = True
        self.state.update_activity()  # Conference started - mark as active
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
        
    def is_stale(self, idle_timeout_minutes: int = 60) -> bool:
        """
        Check if conference is stale.
        Delegates to state model which contains the business logic.
        """
        return self.state.is_stale(idle_timeout_minutes)
    
    async def update_state(self):
        # Save state to storage
        await self.storage_manager.save_state(self.conf_id, self.state.model_dump(by_alias=True))
        # Notify clients
        await self.connection_manager.send_message_to_client(client=self.state.get_teacher(),
                                                             message=self.state.model_dump(by_alias=True))
    
    async def on_websocket_disconnect_callback(self):
        await self.communication_api.reconnect_websocket()
    
    # Dequeue function: runs continuously to process tasks
    async def __process_conf_events_queue(self, timeout: float = 3.0):
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
    

        