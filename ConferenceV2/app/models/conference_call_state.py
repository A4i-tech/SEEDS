# models/conference_call_state.py

from enum import Enum
from pydantic import BaseModel, Field
from typing import Any, Dict, List, Optional

from app.models.action_history import ActionHistory
from app.models.audio_content_state import AudioContentState
from app.models.participant import Participant, Role


class ConferenceCallState(BaseModel):
    is_running: bool = Field(default=False)
    teacher_phone_number: str = None
    leader_phone_number: Optional[str] = None
    participants: Dict[str, Participant] = Field(default_factory=dict)
    hold_detected: bool = Field(default=False)
    audio_content_state: AudioContentState = AudioContentState()
    action_history: List[ActionHistory] = Field(default_factory=list)

    def get_teacher(self):
        if self.teacher_phone_number and self.teacher_phone_number in self.participants:
            return self.participants[self.teacher_phone_number]
        return None

    def get_leader(self):
        if self.leader_phone_number and self.leader_phone_number in self.participants:
            return self.participants[self.leader_phone_number]
        return None

    def get_students(self):
        return [partipant for partipant in self.participants.values() if partipant.role != Role.TEACHER]

    class Config:
        use_enum_values = True  # Automatically use enum values instead of objects for serialization

    def _get_user_action_history(self, action_history: List[Any]) -> List[Any]:
        return [
            action
            for action in action_history
            if not (isinstance(action, dict) and action.get("owner") == "system")
        ]

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
        data["action_history"] = self._get_user_action_history(data.get("action_history", []))
        return convert_enums_to_strings(data)
