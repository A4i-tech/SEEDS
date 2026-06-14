"""Action history model (from ConferenceV2 action_history.py)."""
from __future__ import annotations

from enum import Enum
from typing import Dict

from pydantic import BaseModel, ConfigDict


class ActionType(str, Enum):
    CONFERENCE_CREATED = "Conference-Created"
    CONFERENCE_START = "Conference-Start"
    CONFERENCE_END = "Conference-End"
    CONFERENCE_SINK = "Conference-Sink"
    CONFERENCE_CALLSTATUS_CHANGE = "Conference-CallStatusChange"
    STUDENT_RAISE_HAND_STATE_CHANGE = "Student-RaiseHandStateChange"
    TEACHER_ADD_STUDENT = "Teacher-AddStudent"
    TEACHER_REMOVE_STUDENT = "Teacher-RemoveStudent"
    TEACHER_MUTE_UNMUTE_STUDENT = "Teacher-MuteUnmuteStudent"
    TEACHER_MUTE_ALL = "Teacher-MuteAll"
    TEACHER_UNMUTE_ALL = "Teacher-UnmuteAll"
    TEACHER_AUDIO_PLAYBACK_STATUS_CHANGE = "Teacher-AudioPlaybackStatusChange"
    LEADER_MUTE_ALL_VIA_DTMF = "Leader-MuteAllViaDTMF"
    LEADER_UNMUTE_ALL_VIA_DTMF = "Leader-UnmuteAllViaDTMF"
    LEADER_TOGGLE_CONTENT_VIA_DTMF = "Leader-ToggleContentViaDTMF"
    LEADER_SEEK_CONTENT_VIA_DTMF = "Leader-SeekContentViaDTMF"
    LEADER_SET_SPEED_VIA_DTMF = "Leader-SetSpeedViaDTMF"
    CONFERENCE_START_REQUESTED = "Conference-StartRequested"
    CONFERENCE_START_FAILED = "Conference-StartFailed"
    AUTO_END_TIMER_START = "AutoEnd-TimerStart"
    AUTO_END_TIMER_CANCEL = "AutoEnd-TimerCancel"
    AUTO_END_TIMER_EXPIRED = "AutoEnd-TimerExpired"
    SYSTEM_AUDIO_ANALYSIS = "System-AudioAnalysis"
    SYSTEM_HOLD_DETECTED = "System-HoldDetected"


class ActionHistory(BaseModel):
    """A single action event in the conference action history."""

    model_config = ConfigDict(use_enum_values=True, populate_by_name=True)

    timestamp: str
    action_type: ActionType
    metadata: Dict
    owner: str  # phone number or identifier of the user who performed the action
