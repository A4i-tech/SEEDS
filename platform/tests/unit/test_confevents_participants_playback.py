"""Conference events: participant roster changes, content playback, and conference teardown."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.action_history import ActionType
from app.models.conference_state import ConferenceCallState
from app.models.participant import CallStatus, Participant, Role
from app.models.playback_state import ContentStatus
from app.models.system_audio_messages import SystemAudioMessages
from app.models.ws_service_message import MessageType
from app.services.confevents.add_participant_event import AddParticipantEvent
from app.services.confevents.mute_all_event import MuteAllEvent
from app.services.confevents.mute_participant_event import MuteParticipantEvent
from app.services.confevents.pause_content_event import PauseContentEvent
from app.services.confevents.play_content_event import PlayContentEvent
from app.services.confevents.playback_state_update_event import PlaybackStateUpdateEvent
from app.services.confevents.remove_participant_event import RemoveParticipantEvent
from app.services.confevents.resume_content_event import ResumeContentEvent
from app.services.confevents.seek_content_event import SeekContentEvent
from app.services.confevents.set_playback_speed_event import SetPlaybackSpeedEvent
from app.services.confevents.sink_conf_event import SinkConferenceEvent
from app.services.confevents.unmute_participant_event import UnmuteParticipantEvent

TEACHER = "+911111111111"
STUDENT = "+912222222222"
CONF_ID = "conf-1"
AUDIO_URL = "https://blob.test/output-container/c1/1.0.mp3"


def _participant(phone, role=Role.STUDENT, **overrides):
    return Participant(
        name="Teacher" if role == Role.TEACHER else "Student",
        phone_number=phone,
        role=role,
        **overrides,
    )


@pytest.fixture
def conf():
    conf = MagicMock()
    conf.conf_id = CONF_ID
    conf.state = ConferenceCallState(
        conference_id=CONF_ID,
        teacher_phone_number=TEACHER,
        is_running=True,
        participants={
            TEACHER: _participant(TEACHER, Role.TEACHER, call_status=CallStatus.CONNECTED),
            STUDENT: _participant(STUDENT, call_status=CallStatus.CONNECTED),
        },
    )
    conf.update_state = AsyncMock()
    conf.stream_system_message = AsyncMock()
    conf.communication_api = MagicMock()
    for method in (
        "add_participant", "remove_participant", "mute_participant", "unmute_participant",
        "play_announcement_to_conference",
    ):
        setattr(conf.communication_api, method, AsyncMock())
    return conf


@pytest.fixture
def ws():
    client = MagicMock()
    client.send_message = AsyncMock()
    with patch("app.providers.websocket_client.WebsocketClientProvider", return_value=client):
        yield client


def _last_action(conf):
    return conf.state.action_history[-1]


class TestAddParticipant:
    @pytest.mark.asyncio
    async def test_a_new_number_is_dialled_and_added_muted(self, conf) -> None:
        await AddParticipantEvent("+913333333333", name="Asha", conf_call=conf).execute_event()

        conf.communication_api.add_participant.assert_awaited_once_with(
            "+913333333333", announce_text="Asha"
        )
        added = conf.state.participants["+913333333333"]
        assert (added.name, added.role, added.is_muted, added.added_after_start) == (
            "Asha", Role.STUDENT, True, True,
        )
        assert added.call_status == CallStatus.DISCONNECTED
        conf.update_state.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_a_nameless_participant_gets_a_default_name(self, conf) -> None:
        await AddParticipantEvent("+913333333333", conf_call=conf).execute_event()
        assert conf.state.participants["+913333333333"].name == "Student"

    @pytest.mark.asyncio
    async def test_a_disconnected_participant_is_redialled_not_duplicated(self, conf) -> None:
        conf.state.participants[STUDENT].call_status = CallStatus.DISCONNECTED

        await AddParticipantEvent(STUDENT, name="Ravi", conf_call=conf).execute_event()

        conf.communication_api.add_participant.assert_awaited_once()
        assert conf.state.participants[STUDENT].call_status == CallStatus.CONNECTING
        assert conf.state.participants[STUDENT].name == "Ravi"

    @pytest.mark.asyncio
    async def test_an_already_connected_participant_is_not_redialled(self, conf) -> None:
        await AddParticipantEvent(STUDENT, conf_call=conf).execute_event()

        conf.communication_api.add_participant.assert_not_awaited()
        assert _last_action(conf).action_type == ActionType.TEACHER_ADD_STUDENT


class TestRemoveParticipant:
    @pytest.mark.asyncio
    async def test_removing_drops_the_participant_and_records_the_action(self, conf) -> None:
        await RemoveParticipantEvent(STUDENT, conf).execute_event()

        conf.communication_api.remove_participant.assert_awaited_once_with(STUDENT)
        assert STUDENT not in conf.state.participants
        assert _last_action(conf).action_type == ActionType.TEACHER_REMOVE_STUDENT
        conf.update_state.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_the_remaining_participants_hear_who_left(self, conf) -> None:
        await RemoveParticipantEvent(STUDENT, conf).execute_event()

        conf.communication_api.play_announcement_to_conference.assert_awaited_once_with(
            "Student has left", [TEACHER]
        )

    @pytest.mark.asyncio
    async def test_a_departing_teacher_is_announced_as_the_teacher(self, conf) -> None:
        await RemoveParticipantEvent(TEACHER, conf).execute_event()

        conf.communication_api.play_announcement_to_conference.assert_awaited_once_with(
            "Teacher has left", [STUDENT]
        )

    @pytest.mark.asyncio
    async def test_no_announcement_when_nobody_is_left_connected(self, conf) -> None:
        conf.state.participants[TEACHER].call_status = CallStatus.DISCONNECTED

        await RemoveParticipantEvent(STUDENT, conf).execute_event()

        conf.communication_api.play_announcement_to_conference.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_removing_someone_who_is_not_here_does_nothing(self, conf) -> None:
        await RemoveParticipantEvent("+919999999999", conf).execute_event()

        conf.communication_api.remove_participant.assert_not_awaited()
        conf.update_state.assert_not_awaited()


class TestMuteUnmute:
    @pytest.mark.asyncio
    async def test_muting_a_student_tells_the_teacher(self, conf) -> None:
        await MuteParticipantEvent(STUDENT, conf).execute_event()

        conf.communication_api.mute_participant.assert_awaited_once_with(STUDENT)
        assert conf.state.participants[STUDENT].is_muted is True
        conf.stream_system_message.assert_awaited_once_with(SystemAudioMessages.STUDENT_IS_MUTED)
        assert _last_action(conf).metadata == {"phone_number": STUDENT, "is_muted": True}

    @pytest.mark.asyncio
    async def test_the_teacher_muting_themselves_is_not_announced(self, conf) -> None:
        await MuteParticipantEvent(TEACHER, conf).execute_event()

        assert conf.state.participants[TEACHER].is_muted is True
        conf.stream_system_message.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_the_system_message_can_be_suppressed(self, conf) -> None:
        await MuteParticipantEvent(STUDENT, conf, stream_system_message=False).execute_event()
        conf.stream_system_message.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_muting_an_unknown_number_does_nothing(self, conf) -> None:
        await MuteParticipantEvent("+919999999999", conf).execute_event()

        conf.communication_api.mute_participant.assert_not_awaited()
        conf.update_state.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_unmuting_also_lowers_a_raised_hand(self, conf) -> None:
        conf.state.participants[STUDENT].is_muted = True
        conf.state.participants[STUDENT].is_raised = True
        conf.state.participants[STUDENT].raised_at = 1000

        await UnmuteParticipantEvent(STUDENT, conf).execute_event()

        student = conf.state.participants[STUDENT]
        assert (student.is_muted, student.is_raised, student.raised_at) == (False, False, -1)
        conf.stream_system_message.assert_awaited_once_with(SystemAudioMessages.STUDENT_IS_UNMUTED)

    @pytest.mark.asyncio
    async def test_unmuting_an_unknown_number_does_nothing(self, conf) -> None:
        await UnmuteParticipantEvent("+919999999999", conf).execute_event()
        conf.communication_api.unmute_participant.assert_not_awaited()


class TestMuteAll:
    @pytest.mark.asyncio
    async def test_only_the_unmuted_students_are_muted(self, conf) -> None:
        conf.state.participants["+913333333333"] = _participant("+913333333333", is_muted=True)

        await MuteAllEvent(conf).execute_event()

        conf.communication_api.mute_participant.assert_awaited_once_with(STUDENT)
        assert _last_action(conf).metadata == {
            "muted_count": 1, "total_students": 2, "failed_phones": [],
        }

    @pytest.mark.asyncio
    async def test_the_teacher_is_never_muted_by_mute_all(self, conf) -> None:
        await MuteAllEvent(conf).execute_event()
        assert conf.state.participants[TEACHER].is_muted is False

    @pytest.mark.asyncio
    async def test_a_student_that_fails_to_mute_is_named_in_the_history(self, conf) -> None:
        conf.communication_api.mute_participant.side_effect = RuntimeError("vonage down")

        await MuteAllEvent(conf).execute_event()

        assert _last_action(conf).metadata["failed_phones"] == [STUDENT]
        assert _last_action(conf).metadata["muted_count"] == 0
        conf.stream_system_message.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_nothing_to_mute_still_records_the_action(self, conf) -> None:
        conf.state.participants[STUDENT].is_muted = True

        await MuteAllEvent(conf).execute_event()

        conf.stream_system_message.assert_not_awaited()
        assert _last_action(conf).metadata["muted_count"] == 0

    @pytest.mark.asyncio
    async def test_a_conference_without_a_teacher_is_left_alone(self, conf) -> None:
        conf.state.teacher_phone_number = None

        await MuteAllEvent(conf).execute_event()

        conf.communication_api.mute_participant.assert_not_awaited()
        conf.update_state.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_a_dtmf_triggered_mute_all_is_attributed_to_the_leader(self, conf) -> None:
        await MuteAllEvent(conf, initiator_phone=STUDENT).execute_event()

        assert _last_action(conf).action_type == ActionType.LEADER_MUTE_ALL_VIA_DTMF
        assert _last_action(conf).owner == STUDENT


class TestContentPlayback:
    @pytest.mark.asyncio
    async def test_play_sends_the_url_and_marks_the_content_starting(self, conf, ws) -> None:
        await PlayContentEvent(conf, AUDIO_URL).execute_event()

        message = ws.send_message.await_args.args[0]
        assert (message.websocket_id, message.type, message.message) == (
            CONF_ID, MessageType.PLAY_AUDIO, AUDIO_URL,
        )
        assert conf.state.audio_content_state.current_url == AUDIO_URL
        assert conf.state.audio_content_state.status == ContentStatus.STARTING

    @pytest.mark.asyncio
    async def test_pause_sends_a_pause_message(self, conf, ws) -> None:
        await PauseContentEvent(conf).execute_event()

        assert ws.send_message.await_args.args[0].type == MessageType.PAUSE_AUDIO
        assert _last_action(conf).owner == TEACHER

    @pytest.mark.asyncio
    async def test_resume_sends_a_resume_message_and_restarts_the_content(self, conf, ws) -> None:
        await ResumeContentEvent(conf).execute_event()

        assert ws.send_message.await_args.args[0].type == MessageType.RESUME_AUDIO
        assert conf.state.audio_content_state.status == ContentStatus.STARTING

    @pytest.mark.asyncio
    @pytest.mark.parametrize("event_type", [PauseContentEvent, ResumeContentEvent])
    async def test_a_dtmf_toggle_is_attributed_to_the_leader(self, conf, ws, event_type) -> None:
        await event_type(conf, initiator_phone=STUDENT).execute_event()

        assert _last_action(conf).action_type == ActionType.LEADER_TOGGLE_CONTENT_VIA_DTMF
        assert _last_action(conf).owner == STUDENT


class TestSeekContent:
    @pytest.mark.asyncio
    async def test_an_absolute_seek_sends_a_position(self, conf, ws) -> None:
        await SeekContentEvent(conf, position_seconds=42.5).execute_event()

        message = ws.send_message.await_args.args[0]
        assert message.type == MessageType.SEEK_AUDIO
        assert message.message == '{"positionSeconds": 42.5}'
        assert _last_action(conf).metadata == {"seek_position_seconds": 42.5}

    @pytest.mark.asyncio
    async def test_a_relative_seek_sends_a_delta(self, conf, ws) -> None:
        await SeekContentEvent(conf, delta_seconds=-15).execute_event()

        assert ws.send_message.await_args.args[0].message == '{"deltaSeconds": -15}'
        assert _last_action(conf).metadata == {"seek_delta_seconds": -15}

    @pytest.mark.asyncio
    async def test_a_dtmf_seek_is_attributed_to_the_leader(self, conf, ws) -> None:
        await SeekContentEvent(conf, delta_seconds=10, initiator_phone=STUDENT).execute_event()

        assert _last_action(conf).action_type == ActionType.LEADER_SEEK_CONTENT_VIA_DTMF
        assert _last_action(conf).owner == STUDENT

    def test_a_seek_with_no_target_is_rejected_at_construction(self, conf) -> None:
        with pytest.raises(ValueError, match="Exactly one of delta_seconds or position_seconds"):
            SeekContentEvent(conf)


class TestSetPlaybackSpeed:
    @pytest.mark.asyncio
    async def test_setting_the_speed_sends_it_and_stores_it(self, conf, ws) -> None:
        await SetPlaybackSpeedEvent(conf, 1.5).execute_event()

        message = ws.send_message.await_args.args[0]
        assert (message.type, message.message) == (MessageType.SET_SPEED, "1.5")
        assert conf.state.audio_content_state.speed == 1.5
        assert _last_action(conf).metadata == {"playback_speed": 1.5}

    @pytest.mark.asyncio
    async def test_a_dtmf_speed_change_is_attributed_to_the_leader(self, conf, ws) -> None:
        await SetPlaybackSpeedEvent(conf, 0.75, initiator_phone=STUDENT).execute_event()

        assert _last_action(conf).action_type == ActionType.LEADER_SET_SPEED_VIA_DTMF

    @pytest.mark.parametrize("speed", [0.4, 2.1])
    def test_a_speed_outside_the_supported_range_is_rejected(self, conf, speed) -> None:
        with pytest.raises(ValueError, match="speed must be 0.5-2.0"):
            SetPlaybackSpeedEvent(conf, speed)


class TestPlaybackStateUpdate:
    @pytest.mark.asyncio
    async def test_a_full_update_lands_on_the_content_state(self, conf) -> None:
        await PlaybackStateUpdateEvent(
            conf, ContentStatus.PLAYING, position_seconds=12.0, duration_seconds=300.0, speed=1.25
        ).execute_event()

        state = conf.state.audio_content_state
        assert (state.status, state.position_seconds, state.duration_seconds, state.speed) == (
            ContentStatus.PLAYING, 12.0, 300.0, 1.25,
        )
        conf.update_state.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_omitted_fields_keep_their_previous_values(self, conf) -> None:
        conf.state.audio_content_state.position_seconds = 99.0
        conf.state.audio_content_state.speed = 1.5

        await PlaybackStateUpdateEvent(conf, ContentStatus.PAUSED).execute_event()

        state = conf.state.audio_content_state
        assert (state.status, state.position_seconds, state.speed) == (
            ContentStatus.PAUSED, 99.0, 1.5,
        )


class TestSinkConference:
    @pytest.mark.asyncio
    async def test_sinking_stops_the_conference_and_releases_everything(self, conf) -> None:
        conf.connection_manager = MagicMock()
        conf.connection_manager.disconnect = AsyncMock()
        callback = MagicMock()

        await SinkConferenceEvent(conf, callback).execute_event()

        assert conf.state.is_running is False
        conf.stop_remote_audio_relay.assert_called_once()
        conf.schedule_capture_finalize.assert_called_once()
        conf.end_processing_conf_events_from_queue.assert_called_once()
        conf.connection_manager.disconnect.assert_awaited_once_with(conf.state.get_teacher())
        callback.assert_called_once()
        assert _last_action(conf).action_type == ActionType.CONFERENCE_SINK
        assert _last_action(conf).owner == TEACHER

    @pytest.mark.asyncio
    async def test_sinking_without_a_smartphone_connection_still_works(self, conf) -> None:
        """Skipping the teacher's SSE disconnect must not skip the rest of the teardown."""
        conf.connection_manager = None
        callback = MagicMock()

        await SinkConferenceEvent(conf, callback).execute_event()

        assert conf.state.is_running is False
        conf.stop_remote_audio_relay.assert_called_once()
        conf.schedule_capture_finalize.assert_called_once()
        conf.end_processing_conf_events_from_queue.assert_called_once()
        callback.assert_called_once()
        conf.update_state.assert_awaited_once()
        assert _last_action(conf).action_type == ActionType.CONFERENCE_SINK

    @pytest.mark.asyncio
    async def test_sinking_without_a_callback_still_works(self, conf) -> None:
        conf.connection_manager = None

        await SinkConferenceEvent(conf, None).execute_event()

        assert conf.state.is_running is False
        conf.end_processing_conf_events_from_queue.assert_called_once()
