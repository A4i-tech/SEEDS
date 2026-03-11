import os
import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest

os.environ["STORAGE_ACCOUNT_NAME"] = "test"
os.environ["ENVIRONMENT"] = "development"
os.environ["APPLICATIONINSIGHTS_CONNECTION_STRING"] = (
    "InstrumentationKey=test-key;IngestionEndpoint=https://test.com/"
)

sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/../../")

from app.models.action_history import ActionType
from app.models.participant import CallStatus, Participant, Role
from app.services.confevents.hold_detected_event import HoldDetectedEvent


@pytest.mark.asyncio
async def test_hold_detected_event_marks_student_on_hold_and_logs_action():
    phone_number = "911234567890"
    participant = Participant(
        name="Student",
        phone_number=phone_number,
        role=Role.STUDENT,
        call_status=CallStatus.CONNECTED,
    )
    conf_call = SimpleNamespace(
        conf_id="conf-1",
        state=SimpleNamespace(
            participants={phone_number: participant},
            action_history=[],
            hold_detected=False,
        ),
        update_state=AsyncMock(),
    )

    event = HoldDetectedEvent(phone_number=phone_number, conf_call=conf_call)

    with patch(
        "app.services.confevents.hold_detected_event.asyncio.create_task",
        side_effect=lambda coro: coro.close(),
    ) as mock_create_task:
        await event.execute_event()

    assert participant.call_status == CallStatus.ON_HOLD
    assert conf_call.state.hold_detected is True
    assert len(conf_call.state.action_history) == 1
    assert conf_call.state.action_history[0].action_type == ActionType.SYSTEM_HOLD_DETECTED
    conf_call.update_state.assert_awaited_once()
    mock_create_task.assert_called_once()


@pytest.mark.asyncio
async def test_hold_detected_event_is_noop_if_student_already_on_hold():
    phone_number = "911234567890"
    participant = Participant(
        name="Student",
        phone_number=phone_number,
        role=Role.STUDENT,
        call_status=CallStatus.ON_HOLD,
    )
    conf_call = SimpleNamespace(
        conf_id="conf-2",
        state=SimpleNamespace(
            participants={phone_number: participant},
            action_history=[],
            hold_detected=False,
        ),
        update_state=AsyncMock(),
    )

    event = HoldDetectedEvent(phone_number=phone_number, conf_call=conf_call)

    with patch(
        "app.services.confevents.hold_detected_event.asyncio.create_task",
        side_effect=lambda coro: coro.close(),
    ) as mock_create_task:
        await event.execute_event()

    assert len(conf_call.state.action_history) == 0
    assert conf_call.state.hold_detected is False
    conf_call.update_state.assert_not_called()
    mock_create_task.assert_not_called()
