"""Conference call state model (from ConferenceV2 conference_call_state.py)."""
from __future__ import annotations

from enum import Enum
from typing import Any, Dict, List, Optional

from bson import ObjectId
from pydantic import BaseModel, ConfigDict, Field

from app.models.action_history import ActionHistory
from app.models.participant import Participant, Role
from app.models.playback_state import AudioContentState


class AutoEndState(BaseModel):
    """Tracks the auto-end conference countdown timer."""

    model_config = ConfigDict(populate_by_name=True)

    is_active: bool = False
    started_at: Optional[str] = None   # ISO timestamp
    expires_at: Optional[str] = None   # ISO timestamp
    timeout_minutes: Optional[int] = None


class ConferenceCallState(BaseModel):
    """Full runtime state for an active conference call.

    Persisted in the 'conference_states' collection as a MongoDB document.
    """

    model_config = ConfigDict(use_enum_values=True, populate_by_name=True)

    id: Optional[str] = Field(None, alias="_id")
    conference_id: Optional[str] = None  # Vonage conference UUID / room key
    is_running: bool = False
    teacher_phone_number: Optional[str] = None
    leader_phone_number: Optional[str] = None
    participants: Dict[str, Participant] = Field(default_factory=dict)
    hold_detected: bool = False
    audio_content_state: AudioContentState = Field(default_factory=AudioContentState)
    action_history: List[ActionHistory] = Field(default_factory=list)
    auto_end_state: AutoEndState = Field(default_factory=AutoEndState)
    # Optional denormalised fields for query
    tenant_id: Optional[str] = None
    ended_at: Optional[str] = None  # set when conference ends (ISO timestamp)

    def get_teacher(self) -> Optional[Participant]:
        if self.teacher_phone_number and self.teacher_phone_number in self.participants:
            return self.participants[self.teacher_phone_number]
        return None

    def get_leader(self) -> Optional[Participant]:
        if self.leader_phone_number and self.leader_phone_number in self.participants:
            return self.participants[self.leader_phone_number]
        return None

    def get_students(self) -> List[Participant]:
        return [p for p in self.participants.values() if p.role != Role.TEACHER]

    @classmethod
    def from_mongo(cls, doc: dict) -> "ConferenceCallState":
        if doc is None:
            return None  # type: ignore[return-value]
        d = dict(doc)
        if "_id" in d and isinstance(d["_id"], ObjectId):
            d["_id"] = str(d["_id"])
        return cls.model_validate(d)

    def _get_user_action_history(self, action_history: List[Any]) -> List[Any]:
        return [
            action
            for action in action_history
            if not (isinstance(action, dict) and action.get("owner") == "system")
        ]

    def model_dump(self, **kwargs) -> Dict[str, Any]:
        def convert_enums(data: Any) -> Any:
            if isinstance(data, dict):
                return {k: convert_enums(v) for k, v in data.items()}
            if isinstance(data, list):
                return [convert_enums(item) for item in data]
            if isinstance(data, Enum):
                return data.value
            return data

        data = super().model_dump(**kwargs)
        data["action_history"] = self._get_user_action_history(data.get("action_history", []))
        return convert_enums(data)
