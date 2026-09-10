"""Vonage webhook → ConferenceEvent routing. Errors must never escape a BackgroundTask."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.models.participant import CallStatus
from app.services.conference_event_dispatcher import (
    dispatch_conference_event,
    dispatch_conversation_event,
)

CONF_ID = "conf-1"


def _dtmf_payload(digit: str = "1", to_number: str = "+911111111111", type_: str = "audio:dtmf"):
    return {
        "type": type_,
        "body": {
            "digit": digit,
            "duration": 100,
            "dtmf_seq": 1,
            "channel": {
                "id": "ch1",
                "type": "phone",
                "to": {"type": "phone", "number": to_number},
                "from": {"type": "phone", "number": "+912222222222"},
            },
        },
    }


@pytest.fixture
def conf():
    conf = MagicMock()
    conf.conf_id = CONF_ID
    conf.queue_event = AsyncMock()
    return conf


@pytest.fixture
def manager(conf):
    manager = MagicMock()
    manager.get_conference.return_value = conf
    manager.get_conference_from_phone_number.return_value = conf
    return manager


@pytest.fixture
def caller_state():
    state = MagicMock()
    state.update_state = AsyncMock()
    return state


async def _settle():
    """Let the fire-and-forget caller-state task run."""
    await asyncio.sleep(0)


class TestConferenceEvent:
    @pytest.mark.asyncio
    async def test_answered_queues_a_connected_status_change(
        self, manager, conf, caller_state
    ) -> None:
        await dispatch_conference_event(
            {"status": "answered", "to": "+911111111111"}, CONF_ID, manager, caller_state
        )
        await _settle()

        queued = conf.queue_event.await_args.args[0]
        assert (queued.status, queued.phone_number) == (CallStatus.CONNECTED, "+911111111111")
        caller_state.update_state.assert_awaited_once_with(
            conference_id=CONF_ID,
            participant_id="+911111111111",
            new_state={"call_status": CallStatus.CONNECTED.value, "onHold": False},
        )

    @pytest.mark.asyncio
    @pytest.mark.parametrize(
        ("status", "expected"),
        [
            ("started", CallStatus.CONNECTING),
            ("ringing", CallStatus.CONNECTING),
            ("answered", CallStatus.CONNECTED),
            ("completed", CallStatus.DISCONNECTED),
            ("notconnected", CallStatus.DISCONNECTED),
        ],
    )
    async def test_every_vonage_status_maps_to_a_conference_status(
        self, manager, conf, caller_state, status, expected
    ) -> None:
        await dispatch_conference_event(
            {"status": status, "to": "+911111111111"}, CONF_ID, manager, caller_state
        )
        await _settle()
        assert conf.queue_event.await_args.args[0].status == expected

    @pytest.mark.asyncio
    async def test_an_unknown_conference_is_dropped_without_queueing(
        self, manager, conf, caller_state
    ) -> None:
        manager.get_conference.return_value = None
        await dispatch_conference_event(
            {"status": "answered", "to": "+911111111111"}, CONF_ID, manager, caller_state
        )
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_a_payload_that_is_not_a_status_change_is_tried_as_a_transfer(
        self, manager, conf, caller_state
    ) -> None:
        await dispatch_conference_event(
            {
                "conversation_uuid_from": "cf",
                "type": "transfer",
                "uuid": "leg1",
                "conversation_uuid_to": "ct",
                "timestamp": "2026-08-25T00:00:00Z",
            },
            CONF_ID,
            manager,
            caller_state,
        )
        queued = conf.queue_event.await_args.args[0]
        assert (queued.uuid, queued.conversation_uuid_to) == ("leg1", "ct")

    @pytest.mark.asyncio
    async def test_a_payload_matching_neither_type_is_ignored(
        self, manager, conf, caller_state
    ) -> None:
        await dispatch_conference_event({"unrelated": True}, CONF_ID, manager, caller_state)
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_a_failing_queue_does_not_propagate(self, manager, conf, caller_state) -> None:
        conf.queue_event.side_effect = RuntimeError("queue is gone")
        await dispatch_conference_event(
            {"status": "answered", "to": "+911111111111"}, CONF_ID, manager, caller_state
        )
        await _settle()

    @pytest.mark.asyncio
    async def test_a_failing_transfer_queue_does_not_propagate(
        self, manager, conf, caller_state
    ) -> None:
        conf.queue_event.side_effect = RuntimeError("queue is gone")
        await dispatch_conference_event(
            {
                "conversation_uuid_from": "cf",
                "type": "transfer",
                "uuid": "leg1",
                "conversation_uuid_to": "ct",
                "timestamp": "2026-08-25T00:00:00Z",
            },
            CONF_ID,
            manager,
            caller_state,
        )


class TestConversationEvent:
    @pytest.mark.asyncio
    async def test_a_dtmf_press_is_routed_by_the_callers_phone_number(
        self, manager, conf
    ) -> None:
        await dispatch_conversation_event(_dtmf_payload(digit="7"), manager)

        manager.get_conference_from_phone_number.assert_called_once_with("+911111111111")
        queued = conf.queue_event.await_args.args[0]
        assert (queued.digit, queued.phone_number) == ("7", "+911111111111")

    @pytest.mark.asyncio
    async def test_a_non_dtmf_rtc_event_is_ignored(self, manager, conf) -> None:
        await dispatch_conversation_event(_dtmf_payload(type_="ringing"), manager)
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_a_dtmf_press_from_an_unknown_caller_is_dropped(self, manager, conf) -> None:
        manager.get_conference_from_phone_number.return_value = None
        await dispatch_conversation_event(_dtmf_payload(), manager)
        conf.queue_event.assert_not_awaited()

    @pytest.mark.asyncio
    async def test_a_malformed_payload_does_not_propagate(self, manager, conf) -> None:
        await dispatch_conversation_event({"type": "audio:dtmf"}, manager)
        conf.queue_event.assert_not_awaited()
