"""Bulk mute/unmute throttle: batched Vonage calls, one state write."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.models.participant import CallStatus, Role


def _make_conf(teacher_phone="+111", student_phones=None, muted=False):
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
            is_muted=muted,
        )
        state.participants[phone] = student

    conf.state = state
    conf.communication_api = MagicMock()
    return conf


def _tracker(calls, fail_phone=None):
    in_flight = {"n": 0, "max": 0}

    async def tracked(phone):
        if phone == fail_phone:
            raise RuntimeError("vonage down")
        in_flight["n"] += 1
        in_flight["max"] = max(in_flight["max"], in_flight["n"])
        try:
            await asyncio.sleep(0)
        finally:
            in_flight["n"] -= 1
        calls.append(phone)

    return tracked, in_flight


@pytest.mark.asyncio
async def test_mute_all_batches_calls_and_writes_state_once() -> None:
    from app.services.confevents.mute_all_event import MuteAllEvent

    phones = [f"+2{i:03d}" for i in range(30)]
    conf = _make_conf(student_phones=phones, muted=False)
    calls: list[str] = []
    tracked, in_flight = _tracker(calls, fail_phone=phones[7])
    conf.communication_api.mute_participant = AsyncMock(side_effect=tracked)

    with patch("asyncio.sleep", new=AsyncMock()) as sleep_mock:
        await MuteAllEvent(conf_call=conf).execute_event()

    assert in_flight["max"] <= 3
    throttle_sleeps = [c for c in sleep_mock.await_args_list if c.args == (1.0,)]
    assert len(throttle_sleeps) == 9
    conf.update_state.assert_called_once()
    conf.stream_system_message.assert_called_once()
    assert calls and len(calls) == 29
    assert all(conf.state.participants[p].is_muted for p in phones if p != phones[7])
    entry = conf.state.action_history[-1]
    assert entry.metadata["muted_count"] == 29
    assert entry.metadata["failed_phones"] == [phones[7]]


@pytest.mark.asyncio
async def test_unmute_all_batches_calls_and_writes_state_once() -> None:
    from app.services.confevents.unmute_all_event import UnmuteAllEvent

    phones = [f"+3{i:03d}" for i in range(30)]
    conf = _make_conf(student_phones=phones, muted=True)
    calls: list[str] = []
    tracked, in_flight = _tracker(calls)
    conf.communication_api.unmute_participant = AsyncMock(side_effect=tracked)

    with patch("asyncio.sleep", new=AsyncMock()) as sleep_mock:
        await UnmuteAllEvent(conf_call=conf).execute_event()

    assert in_flight["max"] <= 3
    throttle_sleeps = [c for c in sleep_mock.await_args_list if c.args == (1.0,)]
    assert len(throttle_sleeps) == 9
    conf.update_state.assert_called_once()
    assert len(calls) == 30
    assert all(not conf.state.participants[p].is_muted for p in phones)
    entry = conf.state.action_history[-1]
    assert entry.metadata["unmuted_count"] == 30
