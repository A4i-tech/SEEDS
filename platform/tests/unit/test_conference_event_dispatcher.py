"""Coverage for app.services.conference_event_dispatcher.dispatch_conference_event."""

from __future__ import annotations

import asyncio
import logging
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.conference_event_dispatcher import dispatch_conference_event


def _make_manager(conf):
    manager = MagicMock()
    manager.get_conference = MagicMock(return_value=conf)
    return manager


def _make_conf():
    conf = MagicMock()
    conf.queue_event = AsyncMock()
    return conf


class TestDispatchConferenceEvent:
    async def test_conference_not_found_returns_early(self, caplog: pytest.LogCaptureFixture) -> None:
        manager = _make_manager(None)
        caller_state_manager = AsyncMock()

        with caplog.at_level(logging.WARNING, logger="app.services.conference_event_dispatcher"):
            await dispatch_conference_event({}, "conf-1", manager, caller_state_manager)

        caller_state_manager.update_state.assert_not_called()
        assert "conference not found conf_id=conf-1" in caplog.text

    async def test_status_change_event_dispatches_and_updates_caller_state(self) -> None:
        conf = _make_conf()
        manager = _make_manager(conf)
        caller_state_manager = MagicMock()
        caller_state_manager.update_state = AsyncMock()

        await dispatch_conference_event({"status": "answered", "to": "+123"}, "conf-1", manager, caller_state_manager)
        await asyncio.sleep(0)

        conf.queue_event.assert_awaited_once()
        caller_state_manager.update_state.assert_awaited_once()
        kwargs = caller_state_manager.update_state.call_args.kwargs
        assert kwargs["conference_id"] == "conf-1"
        assert kwargs["participant_id"] == "+123"
        assert kwargs["new_state"]["call_status"] == "connected"
        assert kwargs["new_state"]["onHold"] is False

    async def test_queue_event_failure_is_logged_not_raised(self, caplog: pytest.LogCaptureFixture) -> None:
        conf = _make_conf()
        conf.queue_event = AsyncMock(side_effect=RuntimeError("boom"))
        manager = _make_manager(conf)
        caller_state_manager = MagicMock()
        caller_state_manager.update_state = AsyncMock()

        with caplog.at_level(logging.ERROR, logger="app.services.conference_event_dispatcher"):
            await dispatch_conference_event({"status": "answered", "to": "+123"}, "conf-1", manager, caller_state_manager)
            await asyncio.sleep(0)

        assert "event processing error conf_id=conf-1" in caplog.text
        assert "boom" in caplog.text

    async def test_falls_back_to_transfer_event_on_validation_error(self) -> None:
        conf = _make_conf()
        manager = _make_manager(conf)
        caller_state_manager = AsyncMock()
        transfer_payload = {
            "conversation_uuid_from": "conv-from",
            "type": "transfer",
            "uuid": "leg-1",
            "conversation_uuid_to": "conv-to",
            "timestamp": "2026-01-01T00:00:00Z",
        }

        await dispatch_conference_event(transfer_payload, "conf-1", manager, caller_state_manager)

        conf.queue_event.assert_awaited_once()

    async def test_unmatched_payload_is_logged_and_does_not_raise(self, caplog: pytest.LogCaptureFixture) -> None:
        conf = _make_conf()
        manager = _make_manager(conf)
        caller_state_manager = AsyncMock()

        with caplog.at_level(logging.ERROR, logger="app.services.conference_event_dispatcher"):
            await dispatch_conference_event({"unrelated": "field"}, "conf-1", manager, caller_state_manager)

        conf.queue_event.assert_not_called()
        assert "transfer event error conf_id=conf-1" in caplog.text
