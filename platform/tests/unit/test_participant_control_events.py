"""Coverage for the participant-control conference events: mute, unmute, add, remove."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

from app.models.action_history import ActionType
from app.models.conference_state import ConferenceCallState
from app.models.participant import CallStatus, Participant, Role
from app.models.system_audio_messages import SystemAudioMessages
from app.services.confevents.add_participant_event import AddParticipantEvent
from app.services.confevents.mute_participant_event import MuteParticipantEvent
from app.services.confevents.remove_participant_event import RemoveParticipantEvent
from app.services.confevents.unmute_participant_event import UnmuteParticipantEvent


def _make_conf(teacher_phone="+111", student_phones=None):
    student_phones = student_phones if student_phones is not None else ["+222"]
    conf = MagicMock()
    conf.communication_api = MagicMock()
    conf.communication_api.mute_participant = AsyncMock()
    conf.communication_api.unmute_participant = AsyncMock()
    conf.communication_api.add_participant = AsyncMock()
    conf.communication_api.remove_participant = AsyncMock()
    conf.communication_api.play_announcement_to_conference = AsyncMock()
    conf.stream_system_message = AsyncMock()
    conf.update_state = AsyncMock()

    state = ConferenceCallState()
    state.teacher_phone_number = teacher_phone
    state.participants[teacher_phone] = Participant(
        name="Teacher", phone_number=teacher_phone, role=Role.TEACHER, call_status=CallStatus.CONNECTED,
    )
    for phone in student_phones:
        state.participants[phone] = Participant(
            name="Student", phone_number=phone, role=Role.STUDENT, call_status=CallStatus.CONNECTED, is_muted=True,
        )
    conf.state = state
    return conf


class TestMuteParticipantEvent:
    async def test_unknown_participant_is_noop(self) -> None:
        conf = _make_conf(student_phones=[])
        event = MuteParticipantEvent(phone_number="+999", conf_call=conf)

        await event.execute_event()

        conf.communication_api.mute_participant.assert_not_called()
        conf.update_state.assert_not_called()

    async def test_mutes_student_and_streams_system_message(self) -> None:
        conf = _make_conf(student_phones=["+222"])
        event = MuteParticipantEvent(phone_number="+222", conf_call=conf)

        await event.execute_event()

        conf.communication_api.mute_participant.assert_awaited_once_with("+222")
        assert conf.state.participants["+222"].is_muted is True
        conf.stream_system_message.assert_awaited_once_with(SystemAudioMessages.STUDENT_IS_MUTED)
        entry = conf.state.action_history[-1]
        assert entry.action_type == ActionType.TEACHER_MUTE_UNMUTE_STUDENT
        assert entry.metadata == {"phone_number": "+222", "is_muted": True}
        conf.update_state.assert_awaited_once()

    async def test_muting_teacher_skips_system_message(self) -> None:
        conf = _make_conf(teacher_phone="+111", student_phones=[])
        event = MuteParticipantEvent(phone_number="+111", conf_call=conf)

        await event.execute_event()

        conf.stream_system_message.assert_not_called()

    async def test_stream_system_message_false_skips_broadcast(self) -> None:
        conf = _make_conf(student_phones=["+222"])
        event = MuteParticipantEvent(phone_number="+222", conf_call=conf, stream_system_message=False)

        await event.execute_event()

        conf.stream_system_message.assert_not_called()
        conf.communication_api.mute_participant.assert_awaited_once()


class TestUnmuteParticipantEvent:
    async def test_unknown_participant_is_noop(self) -> None:
        conf = _make_conf(student_phones=[])
        event = UnmuteParticipantEvent(phone_number="+999", conf_call=conf)

        await event.execute_event()

        conf.communication_api.unmute_participant.assert_not_called()

    async def test_unmutes_student_resets_raised_hand_and_streams_message(self) -> None:
        conf = _make_conf(student_phones=["+222"])
        conf.state.participants["+222"].is_raised = True
        conf.state.participants["+222"].raised_at = 123
        event = UnmuteParticipantEvent(phone_number="+222", conf_call=conf)

        await event.execute_event()

        conf.communication_api.unmute_participant.assert_awaited_once_with("+222")
        participant = conf.state.participants["+222"]
        assert participant.is_muted is False
        assert participant.is_raised is False
        assert participant.raised_at == -1
        conf.stream_system_message.assert_awaited_once_with(SystemAudioMessages.STUDENT_IS_UNMUTED)
        entry = conf.state.action_history[-1]
        assert entry.metadata == {"phone_number": "+222", "is_muted": False}

    async def test_unmuting_teacher_skips_system_message(self) -> None:
        conf = _make_conf(teacher_phone="+111", student_phones=[])
        event = UnmuteParticipantEvent(phone_number="+111", conf_call=conf)

        await event.execute_event()

        conf.stream_system_message.assert_not_called()


class TestRemoveParticipantEvent:
    async def test_unknown_participant_is_noop(self) -> None:
        conf = _make_conf(student_phones=[])
        event = RemoveParticipantEvent(phone_number="+999", conf_call=conf)

        await event.execute_event()

        conf.communication_api.remove_participant.assert_not_called()
        conf.update_state.assert_not_called()

    async def test_removes_student_and_announces_to_remaining(self) -> None:
        conf = _make_conf(teacher_phone="+111", student_phones=["+222", "+333"])
        event = RemoveParticipantEvent(phone_number="+222", conf_call=conf)

        await event.execute_event()

        conf.communication_api.play_announcement_to_conference.assert_awaited_once()
        args = conf.communication_api.play_announcement_to_conference.call_args.args
        assert args[0] == "Student has left"
        assert "+222" not in args[1]
        conf.communication_api.remove_participant.assert_awaited_once_with("+222")
        assert "+222" not in conf.state.participants
        entry = conf.state.action_history[-1]
        assert entry.action_type == ActionType.TEACHER_REMOVE_STUDENT
        assert entry.metadata == {"phone_number": "+222"}

    async def test_removing_teacher_announces_teacher_left(self) -> None:
        conf = _make_conf(teacher_phone="+111", student_phones=["+222"])
        event = RemoveParticipantEvent(phone_number="+111", conf_call=conf)

        await event.execute_event()

        args = conf.communication_api.play_announcement_to_conference.call_args.args
        assert args[0] == "Teacher has left"

    async def test_removing_last_participant_skips_announcement(self) -> None:
        conf = _make_conf(teacher_phone="+111", student_phones=[])
        event = RemoveParticipantEvent(phone_number="+111", conf_call=conf)

        await event.execute_event()

        conf.communication_api.play_announcement_to_conference.assert_not_called()
        conf.communication_api.remove_participant.assert_awaited_once_with("+111")


class TestAddParticipantEvent:
    async def test_adds_new_participant_with_defaults(self) -> None:
        conf = _make_conf(teacher_phone="+111", student_phones=[])
        event = AddParticipantEvent(phone_number="+222", conf_call=conf)

        await event.execute_event()

        conf.communication_api.add_participant.assert_awaited_once_with("+222", announce_text=None)
        added = conf.state.participants["+222"]
        assert added.name == "Student"
        assert added.role == Role.STUDENT
        assert added.is_muted is True
        assert added.added_after_start is True
        entry = conf.state.action_history[-1]
        assert entry.action_type == ActionType.TEACHER_ADD_STUDENT

    async def test_adds_new_participant_with_provided_name(self) -> None:
        conf = _make_conf(teacher_phone="+111", student_phones=[])
        event = AddParticipantEvent(phone_number="+222", name="Alice", conf_call=conf)

        await event.execute_event()

        conf.communication_api.add_participant.assert_awaited_once_with("+222", announce_text="Alice")
        assert conf.state.participants["+222"].name == "Alice"

    async def test_reconnects_disconnected_participant_and_updates_name(self) -> None:
        conf = _make_conf(teacher_phone="+111", student_phones=["+222"])
        conf.state.participants["+222"].call_status = CallStatus.DISCONNECTED
        event = AddParticipantEvent(phone_number="+222", name="Bob", conf_call=conf)

        await event.execute_event()

        conf.communication_api.add_participant.assert_awaited_once_with("+222", announce_text="Bob")
        participant = conf.state.participants["+222"]
        assert participant.call_status == CallStatus.CONNECTING
        assert participant.name == "Bob"

    async def test_already_connected_participant_is_left_untouched(self) -> None:
        conf = _make_conf(teacher_phone="+111", student_phones=["+222"])
        conf.state.participants["+222"].call_status = CallStatus.CONNECTED
        event = AddParticipantEvent(phone_number="+222", conf_call=conf)

        await event.execute_event()

        conf.communication_api.add_participant.assert_not_called()
        conf.update_state.assert_awaited_once()
