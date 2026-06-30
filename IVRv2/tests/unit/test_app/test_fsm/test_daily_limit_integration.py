import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from datetime import datetime

from app.fsm.fsm import FSM
from app.fsm.state import State
from app.fsm.transition import Transition
from app.actions.base_actions.talk_action import TalkAction
from app.actions.base_actions.input_action import InputAction
from app.actions.vonage_actions.vonage_connect_action import VonageConnectAction
from app.fsm.operations.daily_limit_pre_operation import DailyLimitPreOperation
from app.utils.model_classes import IVRCallStateMongoDoc


@pytest.fixture
def ivr_state():
    return IVRCallStateMongoDoc(
        _id="test-conv-123",
        phone_number="+919876543210",
        fsm_id="test-fsm",
        current_state_id="menu",
        created_at=datetime.now(),
        tenant_id="tenant-1",
    )


@pytest.fixture
def fsm_with_limit():
    """Create a simple FSM with a content state that has a daily limit pre-operation."""
    fsm = FSM(fsm_id="test-fsm")

    menu_state = State(
        state_id="menu",
        actions=[TalkAction(text="Welcome"), InputAction(type_=["dtmf"], eventApi="/input")],
    )
    content_state = State(
        state_id="content",
        actions=[TalkAction(text="Playing audio"), InputAction(type_=["dtmf"], eventApi="/input")],
        pre_operation=DailyLimitPreOperation(duration_seconds=180, language="en", school_id="school-1"),
    )

    fsm.add_state(menu_state)
    fsm.add_state(content_state)
    fsm.set_init_state_id("menu")
    fsm.add_transition(Transition(source_state_id="menu", dest_state_id="content", input="1", actions=[]))

    return fsm


class TestDailyLimitIntegration:
    @pytest.mark.asyncio
    async def test_allows_playback_when_under_limit(self, fsm_with_limit, ivr_state):
        mock_collection = AsyncMock()
        mock_collection.find_one_by_query = AsyncMock(return_value={"total_seconds": 100})
        mock_collection.collection = MagicMock()
        mock_collection.collection.update_one = AsyncMock()

        mock_app_state = MagicMock()
        mock_app_state.daily_listening_usage_mongo = mock_collection

        with patch("app.core.state.get_app_state", return_value=mock_app_state), \
             patch("app.fsm.fsm.settings") as mock_settings, \
             patch("app.fsm.fsm.get_ist_date_string", return_value="2026-03-27"):
            mock_settings.ivr_daily_listening_limit_seconds = 7200

            actions, next_state = await fsm_with_limit.get_next_actions("1", ivr_state)

            assert next_state == "content"
            # Should contain the content state's actions (not limit message)
            action_texts = [a.text for a in actions if hasattr(a, "text")]
            assert "Playing audio" in action_texts
            # Usage should have been incremented
            mock_collection.collection.update_one.assert_called_once()

    @pytest.mark.asyncio
    async def test_blocks_playback_when_limit_exceeded(self, fsm_with_limit, ivr_state):
        mock_collection = AsyncMock()
        mock_collection.find_one_by_query = AsyncMock(return_value={"total_seconds": 7100})

        mock_app_state = MagicMock()
        mock_app_state.daily_listening_usage_mongo = mock_collection

        with patch("app.core.state.get_app_state", return_value=mock_app_state), \
             patch("app.fsm.fsm.settings") as mock_settings, \
             patch("app.fsm.fsm.get_ist_date_string", return_value="2026-03-27"):
            mock_settings.ivr_daily_listening_limit_seconds = 7200

            actions, next_state = await fsm_with_limit.get_next_actions("1", ivr_state)

            # Should return limit announcement, not content
            action_texts = [a.text for a in actions if hasattr(a, "text")]
            assert any("daily listening limit" in t.lower() for t in action_texts)
            # Should NOT contain "Playing audio"
            assert "Playing audio" not in action_texts

    @pytest.mark.asyncio
    async def test_no_limit_check_for_states_without_operation(self, ivr_state):
        """States without DailyLimitPreOperation should work normally."""
        fsm = FSM(fsm_id="test-fsm")
        state_a = State(
            state_id="a",
            actions=[TalkAction(text="State A"), InputAction(type_=["dtmf"], eventApi="/input")],
        )
        state_b = State(
            state_id="b",
            actions=[TalkAction(text="State B"), InputAction(type_=["dtmf"], eventApi="/input")],
        )
        fsm.add_state(state_a)
        fsm.add_state(state_b)
        fsm.set_init_state_id("a")
        fsm.add_transition(Transition(source_state_id="a", dest_state_id="b", input="1", actions=[]))

        ivr_state.current_state_id = "a"
        actions, next_state = await fsm.get_next_actions("1", ivr_state)

        assert next_state == "b"
        action_texts = [a.text for a in actions if hasattr(a, "text")]
        assert "State B" in action_texts
