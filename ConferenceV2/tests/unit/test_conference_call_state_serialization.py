import os
import sys

sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/../../")

from app.models.action_history import ActionHistory, ActionType
from app.models.conference_call_state import ConferenceCallState


def test_model_dump_filters_system_action_history_but_preserves_hold_flag():
    state = ConferenceCallState(
        hold_detected=True,
        action_history=[
            ActionHistory(
                timestamp="2026-03-11T00:00:00+00:00",
                action_type=ActionType.TEACHER_MUTE_ALL,
                metadata={"reason": "manual"},
                owner="teacher",
            ),
            ActionHistory(
                timestamp="2026-03-11T00:00:01+00:00",
                action_type=ActionType.SYSTEM_HOLD_DETECTED,
                metadata={"status": "on_hold"},
                owner="system",
            ),
        ],
    )

    dumped = state.model_dump()

    assert dumped["hold_detected"] is True
    assert len(dumped["action_history"]) == 1
    assert dumped["action_history"][0]["owner"] == "teacher"
    assert dumped["action_history"][0]["action_type"] == ActionType.TEACHER_MUTE_ALL.value
