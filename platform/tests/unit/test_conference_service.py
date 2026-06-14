"""
Unit tests for conference service and confevent classes.

Uses mocked communication_api, connection_manager, storage_manager so
no real network calls are made.
"""

from __future__ import annotations

import asyncio
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_conf_call(conf_id: str = "conf1") -> Any:
    """Create a ConferenceCall with mocked dependencies."""
    from app.services.conference_service import ConferenceCall

    comm_api = MagicMock()
    comm_api.end_conf = AsyncMock()
    comm_api.get_is_websocket_connected = MagicMock(return_value=False)
    comm_api.mute_participant = AsyncMock()
    comm_api.unmute_participant = AsyncMock()
    comm_api.kick_participant = AsyncMock()
    comm_api.transfer_participant = AsyncMock()

    conn_mgr = MagicMock()
    storage_mgr = MagicMock()
    storage_mgr.update_conference_state = AsyncMock()

    call = ConferenceCall(
        conf_id=conf_id,
        communication_api=comm_api,
        connection_manager=conn_mgr,
        storage_manager=storage_mgr,
    )
    return call


# ---------------------------------------------------------------------------
# ConferenceCall — basic state management
# ---------------------------------------------------------------------------


class TestConferenceCallState:
    def test_initial_state_not_running(self) -> None:
        call = _make_conf_call()
        assert call.state.is_running is False
        assert call.conf_id == "conf1"

    def test_set_participant_state(self) -> None:
        call = _make_conf_call()
        call.set_participant_state(
            teacher_phone="+1111",
            student_phones=["+2222", "+3333"],
            teacher_name="Ms. Smith",
            student_names=["Alice", "Bob"],
        )
        assert call.state.teacher_phone_number == "+1111"
        assert "+2222" in call.state.participants
        assert call.state.participants["+2222"].name == "Alice"
        assert call.state.participants["+3333"].name == "Bob"
        teacher = call.state.get_teacher()
        assert teacher is not None
        assert teacher.name == "Ms. Smith"

    def test_get_students_excludes_teacher(self) -> None:
        call = _make_conf_call()
        call.set_participant_state("+1111", ["+2222", "+3333"])
        students = call.state.get_students()
        assert len(students) == 2
        # teacher should not be in students
        for s in students:
            assert s.phone_number != "+1111"

    def test_set_participant_state_invalid_leader_ignored(self) -> None:
        """leader_phone not in student_phones should be ignored."""
        call = _make_conf_call()
        call.set_participant_state(
            teacher_phone="+1111",
            student_phones=["+2222"],
            leader_phone="+9999",  # not in students
        )
        assert call.state.leader_phone_number is None

    def test_set_participant_state_valid_leader(self) -> None:
        call = _make_conf_call()
        call.set_participant_state(
            teacher_phone="+1111",
            student_phones=["+2222"],
            leader_phone="+2222",
        )
        assert call.state.leader_phone_number == "+2222"

    @pytest.mark.asyncio
    async def test_queue_event_adds_to_queue(self) -> None:
        from app.services.confevents.base_event import ConferenceEvent

        class NoopEvent(ConferenceEvent):
            async def execute_event(self) -> None:
                pass

        call = _make_conf_call()
        await call.queue_event(NoopEvent())
        assert call.event_queue.qsize() == 1

    def test_is_queue_processing_false_initially(self) -> None:
        call = _make_conf_call()
        assert call.is_queue_processing() is False


# ---------------------------------------------------------------------------
# ConferenceCallManager — singleton registry
# ---------------------------------------------------------------------------


def _make_manager():
    """Build a ConferenceCallManager with mock factories."""
    from app.services.conference_service import ConferenceCallManager

    comm_factory = MagicMock()
    comm_factory.create = MagicMock(return_value=MagicMock(
        end_conf=AsyncMock(),
        get_is_websocket_connected=MagicMock(return_value=False),
        mute_participant=AsyncMock(),
        unmute_participant=AsyncMock(),
    ))

    conn_factory = MagicMock()
    conn_factory.create = MagicMock(return_value=MagicMock())

    storage = MagicMock()
    storage.update_conference_state = AsyncMock()
    storage.save_state = AsyncMock()

    conn_factory.create.return_value.send_message_to_client = AsyncMock()

    # Mock redis store to avoid network calls
    redis_mock = MagicMock()
    redis_mock.save = AsyncMock()
    redis_mock.delete = AsyncMock()
    redis_mock.list_active = AsyncMock(return_value=[])

    mgr = ConferenceCallManager(
        communication_api_factory=comm_factory,
        connection_manager_factory=conn_factory,
        storage_manager=storage,
    )
    # Inject mock redis store
    mgr._redis_store = redis_mock
    return mgr


class TestConferenceCallManager:
    def test_get_nonexistent_conference_returns_none(self) -> None:
        mgr = _make_manager()
        assert mgr.get_conference("nope") is None

    def test_get_conference_from_phone_number_not_found(self) -> None:
        mgr = _make_manager()
        result = mgr.get_conference_from_phone_number("+000")
        assert result is None

    @pytest.mark.asyncio
    async def test_create_conference_adds_to_registry(self) -> None:
        mgr = _make_manager()
        conf = await mgr.create_conference(
            teacher_phone="+111",
            student_phones=["+222"],
        )
        assert conf is not None
        found = mgr.get_conference(conf.conf_id)
        assert found is conf

    @pytest.mark.asyncio
    async def test_create_conference_registers_participants(self) -> None:
        mgr = _make_manager()
        conf = await mgr.create_conference(
            teacher_phone="+333",
            student_phones=["+444", "+555"],
            teacher_name="Dr. Khan",
        )
        assert conf.state.teacher_phone_number == "+333"
        assert "+444" in conf.state.participants

    @pytest.mark.asyncio
    async def test_delete_conference_removes_from_registry(self) -> None:
        mgr = _make_manager()
        conf = await mgr.create_conference(teacher_phone="+777", student_phones=[])
        conf_id = conf.conf_id
        mgr.delete_conference(conf_id)
        assert mgr.get_conference(conf_id) is None

    @pytest.mark.asyncio
    async def test_get_conference_from_phone_number_found(self) -> None:
        mgr = _make_manager()
        conf = await mgr.create_conference(teacher_phone="+888", student_phones=["+999"])
        found = mgr.get_conference_from_phone_number("+888")
        assert found is conf


# ---------------------------------------------------------------------------
# ConferenceCallState model
# ---------------------------------------------------------------------------


class TestConferenceCallStateModel:
    def test_get_teacher_returns_none_when_no_teacher(self) -> None:
        from app.models.conference_state import ConferenceCallState

        state = ConferenceCallState()
        assert state.get_teacher() is None

    def test_get_leader_returns_none(self) -> None:
        from app.models.conference_state import ConferenceCallState

        state = ConferenceCallState()
        assert state.get_leader() is None

    def test_from_mongo_none(self) -> None:
        from app.models.conference_state import ConferenceCallState

        result = ConferenceCallState.from_mongo(None)
        assert result is None

    def test_from_mongo_converts_objectid(self) -> None:
        from bson import ObjectId

        from app.models.conference_state import ConferenceCallState

        oid = ObjectId()
        doc = {"_id": oid, "is_running": True}
        state = ConferenceCallState.from_mongo(doc)
        assert isinstance(state.id, str)
        assert state.is_running is True


# ---------------------------------------------------------------------------
# Confevents — model-level tests (no real conf_call needed)
# ---------------------------------------------------------------------------


class TestConfeventModels:
    def test_play_content_event_construction(self) -> None:
        from app.services.confevents.play_content_event import PlayContentEvent

        call = _make_conf_call()
        evt = PlayContentEvent(conf_call=call, url="http://example.com/audio.wav")
        assert evt.url == "http://example.com/audio.wav"

    def test_end_conference_event_construction(self) -> None:
        from app.services.confevents.end_conf_event import EndConferenceEvent

        call = _make_conf_call()
        evt = EndConferenceEvent(conf_call=call)
        assert evt.conf_call is call

    def test_pause_content_event_construction(self) -> None:
        from app.services.confevents.pause_content_event import PauseContentEvent

        call = _make_conf_call()
        evt = PauseContentEvent(conf_call=call)
        assert evt.conf_call is call

    def test_mute_all_event_construction(self) -> None:
        from app.services.confevents.mute_all_event import MuteAllEvent

        call = _make_conf_call()
        evt = MuteAllEvent(conf_call=call)
        assert evt.conf_call is call
        assert evt.stream_system_message is True

    def test_unmute_all_event_construction(self) -> None:
        from app.services.confevents.unmute_all_event import UnmuteAllEvent

        call = _make_conf_call()
        evt = UnmuteAllEvent(conf_call=call)
        assert evt.conf_call is call

    def test_mute_participant_event_construction(self) -> None:
        from app.services.confevents.mute_participant_event import MuteParticipantEvent

        call = _make_conf_call()
        evt = MuteParticipantEvent(phone_number="+9191", conf_call=call)
        assert evt.phone_number == "+9191"

    def test_unmute_participant_event_construction(self) -> None:
        from app.services.confevents.unmute_participant_event import UnmuteParticipantEvent

        call = _make_conf_call()
        evt = UnmuteParticipantEvent(phone_number="+9191", conf_call=call)
        assert evt.phone_number == "+9191"

    def test_add_participant_event_construction(self) -> None:
        from app.services.confevents.add_participant_event import AddParticipantEvent

        call = _make_conf_call()
        evt = AddParticipantEvent(conf_call=call, phone_number="+9191", name="Test")
        assert evt.phone_number == "+9191"

    def test_remove_participant_event_construction(self) -> None:
        from app.services.confevents.remove_participant_event import RemoveParticipantEvent

        call = _make_conf_call()
        evt = RemoveParticipantEvent(conf_call=call, phone_number="+9191")
        assert evt.phone_number == "+9191"

    def test_resume_content_event_construction(self) -> None:
        from app.services.confevents.resume_content_event import ResumeContentEvent

        call = _make_conf_call()
        evt = ResumeContentEvent(conf_call=call)
        assert evt.conf_call is call

    def test_seek_content_event_construction(self) -> None:
        from app.services.confevents.seek_content_event import SeekContentEvent

        call = _make_conf_call()
        evt = SeekContentEvent(conf_call=call, position_seconds=30.0)
        assert evt.position_seconds == 30.0

    def test_set_playback_speed_event_construction(self) -> None:
        from app.services.confevents.set_playback_speed_event import SetPlaybackSpeedEvent

        call = _make_conf_call()
        evt = SetPlaybackSpeedEvent(conf_call=call, speed=1.5)
        assert evt.speed == 1.5

    def test_hold_detected_event_construction(self) -> None:
        from app.services.confevents.hold_detected_event import HoldDetectedEvent

        call = _make_conf_call()
        evt = HoldDetectedEvent(phone_number="+111", conf_call=call)
        assert evt.phone_number == "+111"

    def test_reconnect_comm_api_event_construction(self) -> None:
        from app.services.confevents.reconnect_comm_api_websocket_event import ReconnectCommApiWebsocketEvent

        call = _make_conf_call()
        evt = ReconnectCommApiWebsocketEvent(conf_call=call)
        assert evt.conf_call is call

    def test_playback_state_update_event_construction(self) -> None:
        from app.services.confevents.playback_state_update_event import PlaybackStateUpdateEvent
        from app.models.playback_state import ContentStatus

        call = _make_conf_call()
        evt = PlaybackStateUpdateEvent(conf_call=call, content_state=ContentStatus.PLAYING)
        assert evt.conf_call is call


# ---------------------------------------------------------------------------
# Confevents — execute_event with mocked websocket_client
# ---------------------------------------------------------------------------


class TestConfeventExecution:
    @pytest.mark.asyncio
    async def test_pause_content_event_sends_pause_message(self) -> None:
        from app.services.confevents.pause_content_event import PauseContentEvent
        from app.models.ws_service_message import MessageType

        call = _make_conf_call()
        call.storage_manager.save_state = AsyncMock()

        sent_messages = []

        fake_ws_instance = MagicMock()
        fake_ws_instance.send_message = AsyncMock(side_effect=lambda m: sent_messages.append(m))

        # The lazy import uses `from app.providers.websocket_client import WebsocketClientProvider`
        with patch("app.providers.websocket_client.WebsocketClientProvider", return_value=fake_ws_instance):
            with patch.object(call, "update_state", AsyncMock()):
                evt = PauseContentEvent(conf_call=call)
                await evt.execute_event()

        assert len(sent_messages) == 1
        assert sent_messages[0].type == MessageType.PAUSE_AUDIO

    @pytest.mark.asyncio
    async def test_end_conference_event_sets_not_running(self) -> None:
        from app.services.confevents.end_conf_event import EndConferenceEvent

        call = _make_conf_call()
        call.state.is_running = True

        # Patch the lazy import inside execute_event
        fake_ws = MagicMock()
        fake_ws.send_message = AsyncMock()

        with patch("app.providers.websocket_client.WebsocketClientProvider", return_value=fake_ws):
            with patch.object(call, "update_state", AsyncMock()):
                with patch.object(call, "close_websocket", AsyncMock()):
                    with patch.object(call, "stop_remote_audio_relay", MagicMock()):
                        with patch.object(call, "schedule_capture_finalize", MagicMock()):
                            evt = EndConferenceEvent(conf_call=call)
                            await evt.execute_event()

        assert call.state.is_running is False


# ---------------------------------------------------------------------------
# Caller state service
# ---------------------------------------------------------------------------


class TestCallerStateService:
    @pytest.mark.asyncio
    async def test_update_and_get_state(self) -> None:
        from app.services.caller_state_service import CallerStateService

        svc = CallerStateService()
        await svc.update_state("conf1", "p1", {"call_status": "connected"})
        state, version = await svc.get_current_state("conf1")
        assert state["p1"]["call_status"] == "connected"
        assert version == 1

    @pytest.mark.asyncio
    async def test_update_state_increments_version(self) -> None:
        from app.services.caller_state_service import CallerStateService

        svc = CallerStateService()
        await svc.update_state("conf2", "p1", {"x": 1})
        await svc.update_state("conf2", "p2", {"y": 2})
        _, version = await svc.get_current_state("conf2")
        assert version == 2

    @pytest.mark.asyncio
    async def test_get_state_empty_conference(self) -> None:
        from app.services.caller_state_service import CallerStateService

        svc = CallerStateService()
        state, version = await svc.get_current_state("nonexistent_conf")
        assert state == {}
        assert version == 0


# ---------------------------------------------------------------------------
# Participant model
# ---------------------------------------------------------------------------


class TestParticipantModel:
    def test_participant_default_not_muted(self) -> None:
        from app.models.participant import CallStatus, Participant, Role

        p = Participant(name="Alice", phone_number="+1234", role=Role.STUDENT)
        assert p.is_muted is False
        assert p.call_status == CallStatus.DISCONNECTED

    def test_participant_role_values(self) -> None:
        from app.models.participant import Role

        assert Role.TEACHER == "Teacher"
        assert Role.STUDENT == "Student"

    def test_call_status_values(self) -> None:
        from app.models.participant import CallStatus

        assert CallStatus.CONNECTED == "connected"
        assert CallStatus.ON_HOLD == "on_hold"


# ---------------------------------------------------------------------------
# Conference event dispatcher
# ---------------------------------------------------------------------------


class TestConferenceEventDispatcher:
    @pytest.mark.asyncio
    async def test_dispatch_conference_event_no_conference(self) -> None:
        """dispatch_conference_event with missing conference does nothing."""
        from app.services.conference_event_dispatcher import dispatch_conference_event

        mgr = MagicMock()
        mgr.get_conference = MagicMock(return_value=None)
        caller_state_mgr = MagicMock()

        # Should complete without error
        await dispatch_conference_event(
            event_data={"status": "answered"},
            conference_id="unknown",
            conference_manager=mgr,
            caller_state_manager=caller_state_mgr,
        )

    @pytest.mark.asyncio
    async def test_dispatch_conversation_event_no_match(self) -> None:
        """dispatch_conversation_event with non-DTMF event does nothing."""
        from app.services.conference_event_dispatcher import dispatch_conversation_event

        mgr = MagicMock()
        mgr.get_conference_from_phone_number = MagicMock(return_value=None)

        # Should complete without error
        await dispatch_conversation_event(
            event_data={"type": "some_other_event"},
            conference_manager=mgr,
        )
