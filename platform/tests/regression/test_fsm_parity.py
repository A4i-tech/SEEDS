"""FSM parity regression tests.

Verify the platform FSM engine produces the same state transitions
and action sequences as IVRv2.  All tests are purely in-memory — no DB,
no Service Bus, no Vonage calls.
"""

from __future__ import annotations

import asyncio
import pytest
from typing import Any, Dict, List
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_stream_action(url: str):
    from app.providers.vonage_actions.stream_action import StreamAction  # noqa: PLC0415
    return StreamAction(url=url)


def _make_talk_action(text: str):
    from app.providers.vonage_actions.talk_action import TalkAction  # noqa: PLC0415
    return TalkAction(text=text, level=1.0, bargeIn=False, loop=1, language="en-US")


def _make_input_action():
    from app.providers.vonage_actions.input_action import InputAction  # noqa: PLC0415
    return InputAction(type_=["dtmf"], eventApi="/input", timeOut=10)


def _make_state(state_id: str, actions=None):
    from app.services.fsm.state import State  # noqa: PLC0415
    return State(state_id=state_id, actions=actions or [])


def _make_transition(input_key: str, src: str, dst: str, actions=None):
    from app.services.fsm.transition import Transition  # noqa: PLC0415
    return Transition(input=input_key, source_state_id=src, dest_state_id=dst, actions=actions or [])


def _make_ivr_state_doc(conv_id: str, current_state_id: str, phone: str = "+1234567890"):
    """Build a minimal IVRCallStateMongoDoc in-memory."""
    from app.models.ivr_state import IVRCallStateMongoDoc  # noqa: PLC0415
    from datetime import datetime  # noqa: PLC0415
    return IVRCallStateMongoDoc(
        _id=conv_id,
        phone_number=phone,
        fsm_id="test_fsm",
        current_state_id=current_state_id,
        created_at=datetime.now(),
        tenant_id="test_tenant",
        experience_data={},
    )


def _build_simple_fsm() -> Any:
    """Build a 3-state FSM:

        LA0 (intro)
         ├── "1" → LA1 (option A)
         │    └── "9" → LA0
         └── "2" → LA2 (option B)
              └── "9" → LA0

    All states have a StreamAction. States LA1 and LA2 are leaf nodes
    with a back-to-root key "9".
    """
    from app.services.fsm.fsm import FSM  # noqa: PLC0415

    with patch("app.services.fsm.fsm.get_settings") as mock_settings:
        mock_settings.return_value.storage_account_name = ""
        mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
        fsm = FSM(fsm_id="test_fsm")

    fsm.STORAGE_ACCOUNT_BASE_URL = ""
    fsm.invalid_input_error_actions = [_make_stream_action("wrong.mp3")]
    fsm.empty_input_error_actions = [_make_stream_action("empty.mp3")]

    s0 = _make_state("LA0", [_make_stream_action("intro.mp3"), _make_input_action()])
    s1 = _make_state("LA1", [_make_stream_action("option_a.mp3"), _make_input_action()])
    s2 = _make_state("LA2", [_make_stream_action("option_b.mp3"), _make_input_action()])

    fsm.states["LA0"] = s0
    fsm.states["LA1"] = s1
    fsm.states["LA2"] = s2
    fsm.init_state_id = "LA0"

    s0.add_transition(_make_transition("1", "LA0", "LA1"))
    s0.add_transition(_make_transition("2", "LA0", "LA2"))
    s1.add_transition(_make_transition("9", "LA1", "LA0"))
    s2.add_transition(_make_transition("9", "LA2", "LA0"))

    return fsm


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

class TestFSMTransitions:
    """Core FSM transition parity."""

    @pytest.mark.asyncio
    async def test_valid_dtmf_navigates_to_correct_state(self):
        """DTMF "1" from LA0 should land on LA1."""
        fsm = _build_simple_fsm()
        doc = _make_ivr_state_doc("conv1", "LA0")

        with (
            patch("app.services.fsm.fsm.get_settings") as mock_settings,
            patch("app.platform.database.get_database") as mock_db,
        ):
            mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
            mock_settings.return_value.storage_account_name = ""
            mock_col = AsyncMock()
            mock_col.find_one = AsyncMock(return_value=None)
            mock_col.update_one = AsyncMock(return_value=None)
            mock_db.return_value.__getitem__ = MagicMock(return_value=mock_col)

            actions, next_state_id = await fsm.get_next_actions("1", doc)

        assert next_state_id == "LA1"
        assert len(actions) > 0

    @pytest.mark.asyncio
    async def test_valid_dtmf_2_navigates_to_la2(self):
        """DTMF "2" from LA0 should land on LA2."""
        fsm = _build_simple_fsm()
        doc = _make_ivr_state_doc("conv2", "LA0")

        with (
            patch("app.services.fsm.fsm.get_settings") as mock_settings,
            patch("app.platform.database.get_database") as mock_db,
        ):
            mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
            mock_settings.return_value.storage_account_name = ""
            mock_col = AsyncMock()
            mock_col.find_one = AsyncMock(return_value=None)
            mock_col.update_one = AsyncMock(return_value=None)
            mock_db.return_value.__getitem__ = MagicMock(return_value=mock_col)

            actions, next_state_id = await fsm.get_next_actions("2", doc)

        assert next_state_id == "LA2"

    @pytest.mark.asyncio
    async def test_key_9_returns_to_root(self):
        """DTMF "9" from LA1 should return to LA0."""
        fsm = _build_simple_fsm()
        doc = _make_ivr_state_doc("conv3", "LA1")

        with (
            patch("app.services.fsm.fsm.get_settings") as mock_settings,
            patch("app.platform.database.get_database") as mock_db,
        ):
            mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
            mock_settings.return_value.storage_account_name = ""
            mock_col = AsyncMock()
            mock_col.find_one = AsyncMock(return_value=None)
            mock_col.update_one = AsyncMock(return_value=None)
            mock_db.return_value.__getitem__ = MagicMock(return_value=mock_col)
            # Patch the lazy import inside fsm._stop_websocket_audio_for_state
            with patch(
                "app.providers.websocket_client.WebsocketClientProvider",
                create=True,
            ):
                # Override the entire helper to avoid import error
                fsm._stop_websocket_audio_for_state = AsyncMock(return_value=None)  # type: ignore[method-assign]

                actions, next_state_id = await fsm.get_next_actions("9", doc)

        assert next_state_id == "LA0"

    @pytest.mark.asyncio
    async def test_invalid_input_stays_in_current_state(self):
        """Unknown DTMF key from LA0 should keep state at LA0 + return error actions."""
        fsm = _build_simple_fsm()
        doc = _make_ivr_state_doc("conv4", "LA0")

        with (
            patch("app.services.fsm.fsm.get_settings") as mock_settings,
            patch("app.platform.database.get_database") as mock_db,
        ):
            mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
            mock_settings.return_value.storage_account_name = ""
            mock_col = AsyncMock()
            mock_col.find_one = AsyncMock(return_value=None)
            mock_col.update_one = AsyncMock(return_value=None)
            mock_db.return_value.__getitem__ = MagicMock(return_value=mock_col)

            actions, next_state_id = await fsm.get_next_actions("7", doc)

        assert next_state_id == "LA0", "invalid input must not change state"
        assert len(actions) > 0

    @pytest.mark.asyncio
    async def test_empty_input_stays_in_current_state(self):
        """Empty DTMF from LA0 should stay at LA0 (no input case)."""
        fsm = _build_simple_fsm()
        doc = _make_ivr_state_doc("conv5", "LA0")

        with (
            patch("app.services.fsm.fsm.get_settings") as mock_settings,
            patch("app.platform.database.get_database") as mock_db,
        ):
            mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
            mock_settings.return_value.storage_account_name = ""
            mock_col = AsyncMock()
            mock_col.find_one = AsyncMock(return_value=None)
            mock_col.update_one = AsyncMock(return_value=None)
            mock_db.return_value.__getitem__ = MagicMock(return_value=mock_col)

            actions, next_state_id = await fsm.get_next_actions("", doc)

        assert next_state_id == "LA0"


class TestFSMSerializationRoundTrip:
    """Verify FSM serialize / deserialize preserves structure."""

    def test_serialize_produces_ivr_fsm_doc(self):
        fsm = _build_simple_fsm()
        with patch("app.services.fsm.fsm.get_settings") as mock_settings:
            mock_settings.return_value.storage_account_name = ""
            doc = fsm.serialize()

        assert doc.id == "test_fsm"
        assert doc.init_state_id == "LA0"
        assert len(doc.states) == 3
        state_ids = {s["id"] for s in doc.states}
        assert state_ids == {"LA0", "LA1", "LA2"}

    def test_deserialize_round_trip(self):
        from app.services.fsm.fsm import FSM  # noqa: PLC0415

        fsm = _build_simple_fsm()
        with patch("app.services.fsm.fsm.get_settings") as mock_settings:
            mock_settings.return_value.storage_account_name = ""
            mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
            doc = fsm.serialize()

            # Deserialize into new FSM
            mock_settings.return_value.storage_account_name = ""
            fsm2 = FSM.deserialize(doc)

        assert set(fsm2.states.keys()) == set(fsm.states.keys())
        assert fsm2.init_state_id == fsm.init_state_id
        # Transitions should be preserved
        assert "1" in fsm2.states["LA0"].transition_map
        assert "2" in fsm2.states["LA0"].transition_map
        assert "9" in fsm2.states["LA1"].transition_map

    def test_action_to_json_from_json_round_trip(self):
        from app.providers.vonage_actions.stream_action import StreamAction  # noqa: PLC0415
        from app.providers.vonage_actions.base.action import Action  # noqa: PLC0415

        action = StreamAction(url="https://example.com/audio.mp3", record_playback_time=False)
        data = action.to_json()
        restored = Action.from_json(data)

        assert isinstance(restored, StreamAction)
        assert restored.url == action.url
        assert restored.record_playback_time == action.record_playback_time

    def test_transition_to_json_from_json(self):
        from app.services.fsm.transition import Transition  # noqa: PLC0415

        t = _make_transition("1", "LA0", "LA1", [_make_stream_action("a.mp3")])
        data = t.to_json()
        restored = Transition.from_json(data)

        assert restored.input == "1"
        assert restored.source_state_id == "LA0"
        assert restored.dest_state_id == "LA1"
        assert len(restored.actions) == 1


class TestDailyLimitPreOperation:
    """DailyLimitPreOperation sets flag in experience_data."""

    def test_execute_sets_daily_limit_check_flag(self):
        from app.services.fsm.operations.daily_limit_pre_operation import DailyLimitPreOperation  # noqa: PLC0415

        op = DailyLimitPreOperation(duration_seconds=300.0, language="kannada", school_id="sch1")
        doc = _make_ivr_state_doc("conv6", "LA0")

        assert "_daily_limit_check" not in doc.experience_data

        op.execute(fsm=MagicMock(), fsm_state_doc=doc)

        assert "_daily_limit_check" in doc.experience_data
        check = doc.experience_data["_daily_limit_check"]
        assert check["duration_seconds"] == 300.0
        assert check["language"] == "kannada"
        assert check["school_id"] == "sch1"

    def test_execute_noop_when_no_doc(self):
        from app.services.fsm.operations.daily_limit_pre_operation import DailyLimitPreOperation  # noqa: PLC0415

        op = DailyLimitPreOperation(duration_seconds=100.0, language="hindi")
        # Should not raise
        op.execute(fsm=MagicMock(), fsm_state_doc=None)

    @pytest.mark.asyncio
    async def test_daily_limit_exceeded_blocks_navigation(self):
        """When usage >= limit, get_next_actions returns limit_actions instead of dest state actions."""
        fsm = _build_simple_fsm()

        # Add daily limit pre-operation to LA1
        from app.services.fsm.operations.daily_limit_pre_operation import DailyLimitPreOperation  # noqa: PLC0415
        fsm.states["LA1"].pre_operation = DailyLimitPreOperation(
            duration_seconds=300.0, language="kannada"
        )

        doc = _make_ivr_state_doc("conv7", "LA0")

        with (
            patch("app.services.fsm.fsm.get_settings") as mock_settings,
            patch("app.platform.database.get_database") as mock_db,
        ):
            mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
            mock_settings.return_value.storage_account_name = ""
            mock_col = AsyncMock()
            # Return existing usage that exceeds limit
            mock_col.find_one = AsyncMock(
                return_value={"phone_number": "+1234567890", "date": "2026-06-14", "total_seconds": 1900}
            )
            mock_col.update_one = AsyncMock(return_value=None)
            mock_db.return_value.__getitem__ = MagicMock(return_value=mock_col)

            actions, next_state_id = await fsm.get_next_actions("1", doc)

        # Should still advance to LA1 (limit actions are served AT the dest state)
        assert next_state_id == "LA1"
        # But actions should be the limit announcement (TalkAction), not option_a.mp3
        from app.providers.vonage_actions.talk_action import TalkAction  # noqa: PLC0415
        assert any(isinstance(a, TalkAction) for a in actions), (
            "Expected TalkAction limit announcement when daily limit exceeded"
        )

    @pytest.mark.asyncio
    async def test_daily_limit_not_exceeded_allows_navigation(self):
        """When usage is below limit, navigation proceeds normally."""
        fsm = _build_simple_fsm()

        from app.services.fsm.operations.daily_limit_pre_operation import DailyLimitPreOperation  # noqa: PLC0415
        fsm.states["LA1"].pre_operation = DailyLimitPreOperation(
            duration_seconds=300.0, language="kannada"
        )

        doc = _make_ivr_state_doc("conv8", "LA0")

        with (
            patch("app.services.fsm.fsm.get_settings") as mock_settings,
            patch("app.platform.database.get_database") as mock_db,
        ):
            mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
            mock_settings.return_value.storage_account_name = ""
            mock_col = AsyncMock()
            mock_col.find_one = AsyncMock(
                return_value={"phone_number": "+1234567890", "date": "2026-06-14", "total_seconds": 100}
            )
            mock_col.update_one = AsyncMock(return_value=None)
            mock_db.return_value.__getitem__ = MagicMock(return_value=mock_col)

            actions, next_state_id = await fsm.get_next_actions("1", doc)

        assert next_state_id == "LA1"
        # No limit TalkAction expected
        from app.providers.vonage_actions.talk_action import TalkAction  # noqa: PLC0415
        assert not any(isinstance(a, TalkAction) for a in actions), (
            "Should not return limit announcement when usage is within limit"
        )


class TestDTMFNavigation:
    """Simulate multi-step DTMF navigation."""

    @pytest.mark.asyncio
    async def test_dtmf_sequence_1_then_9(self):
        """Navigate LA0 → LA1 → LA0 via DTMF 1, 9."""
        fsm = _build_simple_fsm()
        doc = _make_ivr_state_doc("convSeq", "LA0")

        def _make_db_mock():
            mock_col = AsyncMock()
            mock_col.find_one = AsyncMock(return_value=None)
            mock_col.update_one = AsyncMock(return_value=None)
            mock_db = MagicMock()
            mock_db.__getitem__ = MagicMock(return_value=mock_col)
            return mock_db

        with (
            patch("app.services.fsm.fsm.get_settings") as mock_settings,
            patch("app.platform.database.get_database") as _mock_db,
        ):
            mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
            mock_settings.return_value.storage_account_name = ""
            _mock_db.return_value = _make_db_mock()
            # Stub the websocket stop helper for key "9"
            fsm._stop_websocket_audio_for_state = AsyncMock(return_value=None)  # type: ignore[method-assign]

            # Step 1: press 1 from LA0
            actions1, state1 = await fsm.get_next_actions("1", doc)
            assert state1 == "LA1"
            doc.current_state_id = state1

            # Step 2: press 9 from LA1 → back to LA0
            actions2, state2 = await fsm.get_next_actions("9", doc)
            assert state2 == "LA0"

    @pytest.mark.asyncio
    async def test_dtmf_sequence_2_then_invalid(self):
        """LA0 → LA2 via 2, then invalid key stays at LA2."""
        fsm = _build_simple_fsm()
        doc = _make_ivr_state_doc("convSeq2", "LA0")

        def _make_db_mock():
            mock_col = AsyncMock()
            mock_col.find_one = AsyncMock(return_value=None)
            mock_col.update_one = AsyncMock(return_value=None)
            mock_db = MagicMock()
            mock_db.__getitem__ = MagicMock(return_value=mock_col)
            return mock_db

        with (
            patch("app.services.fsm.fsm.get_settings") as mock_settings,
            patch("app.platform.database.get_database") as _mock_db,
        ):
            mock_settings.return_value.ivr_daily_listening_limit_seconds = 1800
            mock_settings.return_value.storage_account_name = ""
            _mock_db.return_value = _make_db_mock()

            # Step 1: press 2 → LA2
            _, state1 = await fsm.get_next_actions("2", doc)
            assert state1 == "LA2"
            doc.current_state_id = state1

            # Step 2: invalid key 5 → stays at LA2
            _, state2 = await fsm.get_next_actions("5", doc)
            assert state2 == "LA2"
