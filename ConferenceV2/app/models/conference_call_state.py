# models/conference_call_state.py

from enum import Enum
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional
from datetime import datetime

from app.models.action_history import ActionHistory
from app.models.audio_content_state import AudioContentState
from app.models.participant import Participant, Role, CallStatus


class ConferenceCallState(BaseModel):
    is_running: bool = Field(default=False)
    teacher_phone_number: str = None
    participants: Dict[str, Participant] = Field(default_factory=dict)
    audio_content_state: AudioContentState = AudioContentState()
    action_history: List[ActionHistory] = Field(default_factory=list)
    # Activity tracking for stale conference detection
    last_activity_at: Optional[str] = Field(default=None)  # ISO format timestamp
    created_at: Optional[str] = Field(default=None)  # ISO format timestamp

    def get_teacher(self):
        if self.teacher_phone_number and self.teacher_phone_number in self.participants:
            return self.participants[self.teacher_phone_number]
        return None
    
    def get_students(self):
        return [partipant for partipant in self.participants.values() if partipant.role != Role.TEACHER]
    
    def has_connected_participants(self) -> bool:
        """
        Check if conference has any connected participants.
        Returns True if at least one participant has call_status == CONNECTED.
        """
        if not self.participants:
            return False
        for participant in self.participants.values():
            if participant.call_status == CallStatus.CONNECTED:
                return True
        return False
    
    def update_activity(self):
        """
        Update the last activity timestamp.
        Call this whenever there's activity in the conference.
        """
        self.last_activity_at = datetime.now().isoformat()
    
    def is_stale(self, idle_timeout_minutes: int = 60) -> bool:
        """
        Check if conference is stale.
        A conference is stale if:
        - Has no connected participants AND
        - Has been idle (no activity) for more than idle_timeout_minutes
        """
        # If there are connected participants, conference is not stale
        if self.has_connected_participants():
            # Reset activity timestamp since participants are present
            self.update_activity()
            return False
        
        # No connected participants - check if idle for too long
        if not self.last_activity_at:
            # If never had activity, use created_at or current time
            reference_time = self.created_at if self.created_at else datetime.now().isoformat()
        else:
            reference_time = self.last_activity_at
        
        try:
            last_activity = datetime.fromisoformat(reference_time)
            idle_minutes = (datetime.now() - last_activity).total_seconds() / 60
            return idle_minutes > idle_timeout_minutes
        except (ValueError, TypeError):
            # If timestamp parsing fails, consider it stale if no participants
            return True

    class Config:
        use_enum_values = True  # Automatically use enum values instead of objects for serialization

    

    def model_dump(self, **kwargs):
        def convert_enums_to_strings(data: Any) -> Any:
            if isinstance(data, dict):
                return {key: convert_enums_to_strings(value) for key, value in data.items()}
            elif isinstance(data, list):
                return [convert_enums_to_strings(item) for item in data]
            elif isinstance(data, Enum):
                return data.value  # Convert Enum to its string value
            else:
                return data  # Return the value as is if it's not a dict, list, or Enum
        # Override the model_dump to ensure proper serialization of Enums as strings
        data = super().model_dump(**kwargs)
        return convert_enums_to_strings(data)