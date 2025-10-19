import pytest
import sys
import os
from unittest.mock import AsyncMock, MagicMock

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from app.fsm.fsm import FSM
from app.fsm.state import State
from app.fsm.transition import Transition
from app.actions.base_actions.talk_action import TalkAction
from app.actions.base_actions.stream_action import StreamAction
from app.actions.base_actions.input_action import InputAction
from app.utils.model_classes import IVRCallStateMongoDoc, IVRfsmDoc
from datetime import datetime


class TestFSM:
    """Unit tests for FSM (Finite State Machine) class."""

    def test_fsm_initialization(self):
        """Test FSM can be initialized with an ID."""
        fsm_id = "test_fsm_123"
        fsm = FSM(fsm_id=fsm_id)
        
        assert fsm.fsm_id == fsm_id
        assert fsm.states == {}
        assert fsm.init_state_id == "LA0"  # FSM has default init_state_id
        assert isinstance(fsm.empty_input_error_actions, list)
        assert isinstance(fsm.invalid_input_error_actions, list)

    def test_fsm_add_state(self):
        """Test adding a state to the FSM."""
        fsm = FSM(fsm_id="test")
        state = State(state_id="state1", actions=[TalkAction(text="Hello")])
        
        fsm.add_state(state)
        
        assert "state1" in fsm.states
        assert fsm.states["state1"] == state

    def test_fsm_set_init_state_id(self):
        """Test setting the initial state ID."""
        fsm = FSM(fsm_id="test")
        init_state_id = "start_state"
        
        # Add the state first before setting it as init state
        state = State(state_id=init_state_id, actions=[TalkAction(text="Hello")])
        fsm.add_state(state)
        fsm.set_init_state_id(init_state_id)
        
        assert fsm.init_state_id == init_state_id

    def test_fsm_add_transition(self):
        """Test adding a transition to the FSM."""
        fsm = FSM(fsm_id="test")
        
        # Create states
        state1 = State(state_id="state1", actions=[])
        state2 = State(state_id="state2", actions=[])
        
        fsm.add_state(state1)
        fsm.add_state(state2)
        
        # Create and add transition
        transition = Transition(source_state_id="state1", dest_state_id="state2", input="1", actions=[])
        fsm.add_transition(transition)
        
        # Verify transition was added to the source state
        assert "1" in state1.transition_map
        assert state1.transition_map["1"] == transition

    def test_fsm_get_state(self):
        """Test getting a state from the FSM."""
        fsm = FSM(fsm_id="test")
        state = State(state_id="test_state", actions=[])
        
        fsm.add_state(state)
        
        retrieved_state = fsm.get_state("test_state")
        assert retrieved_state == state
        
        # Test non-existent state
        non_existent = fsm.get_state("non_existent")
        assert non_existent is None

    def test_fsm_get_start_fsm_actions(self):
        """Test getting actions for the initial state."""
        fsm = FSM(fsm_id="test")
        
        actions = [TalkAction(text="Welcome"), TalkAction(text="Press 1 to continue")]
        init_state = State(state_id="init", actions=actions)
        
        fsm.add_state(init_state)
        fsm.set_init_state_id("init")
        
        start_actions = fsm.get_start_fsm_actions()
        
        assert start_actions == actions
        assert len(start_actions) == 2

    def test_fsm_get_start_fsm_actions_non_existent_init_state(self):
        """Test getting start actions when init state doesn't exist."""
        fsm = FSM(fsm_id="test")
        # First add a state to avoid the error, then try to set non-existent one
        state = State(state_id="temp", actions=[TalkAction(text="temp")])
        fsm.add_state(state)
        
        with pytest.raises(ValueError) as exc_info:
            fsm.set_init_state_id("non_existent")
        
        assert "Cannot set initial state to non_existent" in str(exc_info.value)

    @pytest.mark.asyncio
    async def test_fsm_get_next_actions_valid_input(self):
        """Test getting next actions for valid input."""
        fsm = FSM(fsm_id="test")
        
        # Create states
        state1 = State(state_id="state1", actions=[TalkAction(text="In state 1")])
        state2 = State(state_id="state2", actions=[TalkAction(text="In state 2")])
        
        fsm.add_state(state1)
        fsm.add_state(state2)
        
        # Add transition
        transition_actions = [TalkAction(text="Moving to state 2")]
        transition = Transition(source_state_id="state1", dest_state_id="state2", input="1", actions=transition_actions)
        fsm.add_transition(transition)
        
        # Create IVR state document
        ivr_state = IVRCallStateMongoDoc(
            _id="test_conv",
            phone_number="+1234567890",
            fsm_id="test",
            current_state_id="state1",
            created_at=datetime.now()
        )
        
        next_actions, next_state_id = await fsm.get_next_actions("1", ivr_state)
        
        assert next_state_id == "state2"
        assert len(next_actions) >= 1  # Should include transition actions and destination state actions
        # Check that transition actions are included
        transition_action_found = False
        for action in next_actions:
            if isinstance(action, TalkAction) and action.text == "Moving to state 2":
                transition_action_found = True
                break
        assert transition_action_found

    @pytest.mark.asyncio
    async def test_fsm_get_next_actions_invalid_input(self):
        """Test getting next actions for invalid input."""
        fsm = FSM(fsm_id="test")
        
        state1 = State(state_id="state1", actions=[TalkAction(text="In state 1")])
        fsm.add_state(state1)
        
        ivr_state = IVRCallStateMongoDoc(
            _id="test_conv",
            phone_number="+1234567890",
            fsm_id="test",
            current_state_id="state1",
            created_at=datetime.now()
        )
        
        next_actions, next_state_id = await fsm.get_next_actions("9", ivr_state)
        
        # Should stay in the same state for invalid input
        assert next_state_id == "state1"
        # Should include error actions plus current state actions
        assert len(next_actions) >= 1

    def test_fsm_serialize(self):
        """Test FSM serialization to IVRfsmDoc."""
        fsm = FSM(fsm_id="test_fsm")
        
        # Add a simple state
        state = State(state_id="state1", actions=[TalkAction(text="Hello")])
        fsm.add_state(state)
        fsm.set_init_state_id("state1")
        
        # Add a transition
        transition = Transition(source_state_id="state1", dest_state_id="state1", input="1", actions=[])
        fsm.add_transition(transition)
        
        serialized = fsm.serialize()
        
        assert isinstance(serialized, IVRfsmDoc)
        assert serialized.id == "test_fsm"
        assert serialized.init_state_id == "state1"
        assert len(serialized.states) == 1
        assert len(serialized.transitions) == 1