import pytest
import asyncio
from unittest.mock import AsyncMock
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/../")

from app.services.conference_call import ConferenceCall
from app.services.confevents.add_participant_event import AddParticipantEvent
from app.models.participant import Role


@pytest.fixture
def mock_services():
    communication_api = AsyncMock()
    communication_api.start_conf = AsyncMock()
    communication_api.get_is_websocket_connected = AsyncMock(return_value=True)
    communication_api.reconnect_websocket = AsyncMock()
    communication_api.add_participant = AsyncMock()
    communication_api.play_announcement_to_conference = AsyncMock()

    storage_manager = AsyncMock()
    storage_manager.save_state = AsyncMock()

    connection_manager = AsyncMock()
    connection_manager.connect = AsyncMock(return_value={"status": "connected"})
    connection_manager.disconnect = AsyncMock(return_value={"status": "disconnected"})
    connection_manager.send_message_to_client = AsyncMock()

    return communication_api, storage_manager, connection_manager


@pytest.fixture
def conference_call(mock_services):
    communication_api, storage_manager, connection_manager = mock_services
    conf = ConferenceCall(
        conf_id="test-conf-names",
        communication_api=communication_api,
        storage_manager=storage_manager,
        connection_manager=connection_manager
    )
    # Ensure there is a teacher phone set for action history owner
    conf.state.teacher_phone_number = "+1000"
    return conf, communication_api


def test_set_participant_state_with_names(conference_call):
    conf_call, _ = conference_call
    teacher_phone = "+100"
    student_phones = ["+111", "+222"]
    conf_call.set_participant_state(teacher_phone, student_phones, teacher_name="Ms. Smith", student_names=["Alice", "Bob"])

    assert conf_call.state.get_teacher().name == "Ms. Smith"
    assert conf_call.state.participants["+111"].name == "Alice"
    assert conf_call.state.participants["+222"].name == "Bob"


@pytest.mark.asyncio
async def test_add_participant_event_calls_comm_api_with_name(conference_call):
    conf_call, comm_api = conference_call
    phone = "+333"
    event = AddParticipantEvent(phone_number=phone, name="Charlie", conf_call=conf_call)
    await event.execute_event()
    comm_api.add_participant.assert_awaited_with(phone, announce_text="Charlie")

