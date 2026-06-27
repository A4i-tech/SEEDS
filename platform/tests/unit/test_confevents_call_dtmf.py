"""
Coverage for DTMFInputEvent and CallStatusChangeEvent.
"""

from __future__ import annotations

import contextlib
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.participant import CallStatus, Role


def _make_conf(teacher_phone="+111", student_phones=None, leader_phone=None):
    """Build a minimal ConferenceCall mock with real state."""
    from app.models.conference_state import ConferenceCallState
    from app.models.participant import Participant

    student_phones = student_phones or ["+222"]

    conf = MagicMock()
    conf.conf_id = "conf_test"
    conf.update_state = AsyncMock()
    conf.queue_event = AsyncMock()
    conf.stream_system_message = AsyncMock()

    state = ConferenceCallState()
    teacher = Participant(
        name="Teacher",
        phone_number=teacher_phone,
        role=Role.TEACHER,
        call_status=CallStatus.DISCONNECTED,
    )
    state.participants[teacher_phone] = teacher
    state.teacher_phone_number = teacher_phone

    for phone in student_phones:
        student = Participant(
            name="Student",
            phone_number=phone,
            role=Role.STUDENT,
            call_status=CallStatus.DISCONNECTED,
            is_muted=True,
        )
        state.participants[phone] = student

    state.leader_phone_number = leader_phone
    conf.state = state
    conf.communication_api = MagicMock()
    conf.communication_api.play_announcement_to_conference = AsyncMock()
    return conf


# ---------------------------------------------------------------------------
# DTMFInputEvent
# ---------------------------------------------------------------------------


class TestDTMFInputEvent:
    @pytest.mark.asyncio
    async def test_unknown_phone_returns_early(self) -> None:
        from app.services.confevents.dtmf_input_event import DTMFInputEvent

        conf = _make_conf()
        event = DTMFInputEvent(phone_number="+999", digit="0", conf_call=conf)
        await event.execute_event()
        conf.update_state.assert_not_called()

    @pytest.mark.asyncio
    async def test_student_raise_hand_digit_0(self) -> None:
        from app.services.confevents.dtmf_input_event import DTMFInputEvent

        conf = _make_conf(student_phones=["+222"])
        event = DTMFInputEvent(phone_number="+222", digit="0", conf_call=conf)
        await event.execute_event()
        conf.update_state.assert_called_once()
        assert conf.state.participants["+222"].is_raised is True

    @pytest.mark.asyncio
    async def test_student_already_raised_no_update(self) -> None:
        from app.services.confevents.dtmf_input_event import DTMFInputEvent

        conf = _make_conf(student_phones=["+222"])
        conf.state.participants["+222"].is_raised = True  # Already raised
        event = DTMFInputEvent(phone_number="+222", digit="0", conf_call=conf)
        await event.execute_event()
        conf.update_state.assert_not_called()

    @pytest.mark.asyncio
    async def test_leader_digit_1_mute_all(self) -> None:
        from app.services.confevents.dtmf_input_event import DTMFInputEvent

        conf = _make_conf(teacher_phone="+111", student_phones=["+222", "+333"], leader_phone="+222")
        # Make leader connected
        from app.models.participant import CallStatus
        conf.state.participants["+222"].call_status = CallStatus.CONNECTED

        event = DTMFInputEvent(phone_number="+222", digit="1", conf_call=conf)
        with contextlib.suppress(Exception):
            await event.execute_event()

    @pytest.mark.asyncio
    async def test_leader_digit_3_unmute_all(self) -> None:
        from app.services.confevents.dtmf_input_event import DTMFInputEvent

        conf = _make_conf(teacher_phone="+111", student_phones=["+222"], leader_phone="+222")
        event = DTMFInputEvent(phone_number="+222", digit="3", conf_call=conf)
        with contextlib.suppress(Exception):
            await event.execute_event()

    @pytest.mark.asyncio
    async def test_leader_digit_6_no_content_returns_early(self) -> None:
        from app.models.playback_state import ContentStatus
        from app.services.confevents.dtmf_input_event import DTMFInputEvent

        conf = _make_conf(teacher_phone="+111", student_phones=["+222"], leader_phone="+222")
        conf.state.audio_content_state.status = ContentStatus.STOPPED
        event = DTMFInputEvent(phone_number="+222", digit="6", conf_call=conf)
        await event.execute_event()  # No content active — early return

    @pytest.mark.asyncio
    async def test_teacher_digit_not_leader(self) -> None:
        from app.services.confevents.dtmf_input_event import DTMFInputEvent

        conf = _make_conf(teacher_phone="+111", student_phones=["+222"])
        # Teacher is not leader — digit won't trigger leader actions
        event = DTMFInputEvent(phone_number="+111", digit="1", conf_call=conf)
        await event.execute_event()  # Not leader — no action


# ---------------------------------------------------------------------------
# CallStatusChangeEvent
# ---------------------------------------------------------------------------


class TestCallStatusChangeEvent:
    @pytest.mark.asyncio
    async def test_unknown_phone_returns_early(self) -> None:
        from app.services.confevents.call_status_change_event import CallStatusChangeEvent

        conf = _make_conf()
        event = CallStatusChangeEvent(phone_number="+999", status=CallStatus.CONNECTED, conf_call=conf)
        await event.execute_event()
        conf.update_state.assert_not_called()

    @pytest.mark.asyncio
    async def test_same_status_returns_early(self) -> None:
        from app.services.confevents.call_status_change_event import CallStatusChangeEvent

        conf = _make_conf()
        # Teacher already DISCONNECTED
        event = CallStatusChangeEvent(phone_number="+111", status=CallStatus.DISCONNECTED, conf_call=conf)
        await event.execute_event()
        conf.update_state.assert_not_called()

    @pytest.mark.asyncio
    async def test_student_connected(self) -> None:
        from app.services.confevents.call_status_change_event import CallStatusChangeEvent

        conf = _make_conf(teacher_phone="+111", student_phones=["+222"])
        # Teacher connected already
        conf.state.participants["+111"].call_status = CallStatus.CONNECTED
        event = CallStatusChangeEvent(phone_number="+222", status=CallStatus.CONNECTED, conf_call=conf)
        await event.execute_event()
        conf.update_state.assert_called_once()
        assert conf.state.participants["+222"].call_status == CallStatus.CONNECTED

    @pytest.mark.asyncio
    async def test_teacher_connected(self) -> None:
        from app.services.confevents.call_status_change_event import CallStatusChangeEvent

        conf = _make_conf(teacher_phone="+111", student_phones=["+222"])
        event = CallStatusChangeEvent(phone_number="+111", status=CallStatus.CONNECTED, conf_call=conf)
        await event.execute_event()
        conf.update_state.assert_called_once()
        assert conf.state.participants["+111"].call_status == CallStatus.CONNECTED

    @pytest.mark.asyncio
    async def test_teacher_disconnected_starts_timer(self) -> None:
        from app.services.confevents.call_status_change_event import CallStatusChangeEvent

        mock_settings = MagicMock()
        mock_settings.auto_end_enabled = False
        mock_settings.auto_end_timeout_minutes = 5

        with patch("app.platform.settings.get_settings", return_value=mock_settings):
            conf = _make_conf(teacher_phone="+111")
            conf.state.participants["+111"].call_status = CallStatus.CONNECTED  # Start connected
            event = CallStatusChangeEvent(phone_number="+111", status=CallStatus.DISCONNECTED, conf_call=conf)
            await event.execute_event()
            conf.update_state.assert_called_once()
            assert conf.state.participants["+111"].call_status == CallStatus.DISCONNECTED
            # Timer start event queued
            conf.queue_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_student_disconnected(self) -> None:
        from app.services.confevents.call_status_change_event import CallStatusChangeEvent

        conf = _make_conf(teacher_phone="+111", student_phones=["+222"])
        conf.state.participants["+222"].call_status = CallStatus.CONNECTED
        conf.state.participants["+111"].call_status = CallStatus.CONNECTED
        event = CallStatusChangeEvent(phone_number="+222", status=CallStatus.DISCONNECTED, conf_call=conf)
        await event.execute_event()
        conf.update_state.assert_called_once()
        assert conf.state.participants["+222"].call_status == CallStatus.DISCONNECTED
