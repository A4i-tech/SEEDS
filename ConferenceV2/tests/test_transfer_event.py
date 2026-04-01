import pytest
import asyncio
from unittest.mock import AsyncMock, Mock
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/../")

from app.services.confevents.vonage.vonage_call_leg_transfer_event import (
    VonageCallTransferEvent,
)
from app.models.participant import Participant, Role
from app.services.communication_api.vonage_api import VonageAPI


class DummyVonage(VonageAPI):
    def __init__(self):
        # Avoid parent init
        pass


def make_conf_with_participants():
    # Create a minimal Conference-like object without importing ConferenceCall
    comm_api = DummyVonage()
    comm_api.get_is_websocket_connected = Mock(return_value=True)
    comm_api.play_announcement_to_conference = AsyncMock()
    comm_api.handle_call_transfer_event = AsyncMock(return_value=None)
    comm_api.vonage_conv_id = "conv-1"

    class DummyState:
        def __init__(self):
            self.participants = {}
            self.teacher_phone_number = None

        def get_teacher(self):
            # Return any teacher Participant if present
            if (
                self.teacher_phone_number
                and self.teacher_phone_number in self.participants
            ):
                return self.participants[self.teacher_phone_number]
            return None

    class DummyConf:
        def __init__(self):
            self.conf_id = "test-conf"
            self.communication_api = comm_api
            self.state = DummyState()
            # streaming service mock
            self._system_message_streaming_service = AsyncMock()

        async def stream_system_message(self, message):
            return await self._system_message_streaming_service.stream_message(message)

    conf = DummyConf()
    # Add a default teacher participant to avoid get_teacher() returning None
    teacher = Participant(
        name="Teacher", phone_number="+999", role=Role.TEACHER, is_initial=True
    )
    conf.state.participants[teacher.phone_number] = teacher
    conf.state.teacher_phone_number = teacher.phone_number
    return conf, comm_api


@pytest.mark.asyncio
async def test_initial_participant_no_tts_on_transfer():
    conf, comm_api = make_conf_with_participants()
    # Initial roster student (not added after start)
    alice = Participant(
        name="Alice", phone_number="+111", role=Role.STUDENT, added_after_start=False
    )
    conf.state.participants[alice.phone_number] = alice
    # Simulate handle_call_transfer_event returning alice's number
    comm_api.handle_call_transfer_event = AsyncMock(return_value=alice.phone_number)
    # Mark websocket as connected before transfer
    comm_api.get_is_websocket_connected = Mock(return_value=True)

    event = VonageCallTransferEvent(
        conf_call=conf,
        conversation_uuid_from="",
        type="",
        uuid="u1",
        conversation_uuid_to=comm_api.vonage_conv_id,
        timestamp="",
    )
    await event.execute_event()

    # Transfer event does not use conference TTS or system message streaming.
    assert comm_api.play_announcement_to_conference.await_count == 0
    assert conf._system_message_streaming_service.stream_message.await_count == 0


@pytest.mark.asyncio
async def test_added_participant_no_tts_on_transfer():
    conf, comm_api = make_conf_with_participants()
    # Add a participant that was added after start (should trigger TTS)
    candice = Participant(
        name="Candice", phone_number="+222", role=Role.STUDENT, added_after_start=True
    )
    conf.state.participants[candice.phone_number] = candice
    comm_api.handle_call_transfer_event = AsyncMock(return_value=candice.phone_number)
    comm_api.get_is_websocket_connected = Mock(
        return_value=False
    )  # websocket was not connected before

    event = VonageCallTransferEvent(
        conf_call=conf,
        conversation_uuid_from="",
        type="",
        uuid="u2",
        conversation_uuid_to="conv-2",
        timestamp="",
    )
    await event.execute_event()

    # Transfer event does not use conference TTS or system message streaming.
    assert comm_api.play_announcement_to_conference.await_count == 0
    assert conf._system_message_streaming_service.stream_message.await_count == 0
