import pytest
import sys
import os

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from app.fsm.state import State
from app.fsm.transition import Transition
from app.actions.base_actions.talk_action import TalkAction
from app.actions.base_actions.stream_action import StreamAction
from app.actions.base_actions.input_action import InputAction
from app.utils.model_classes import Menu, Option


class TestState:
    """Unit tests for State class."""

    def test_state_initialization(self):
        """Test State can be initialized with required parameters."""
        state_id = "test_state"
        actions = [TalkAction(text="Hello")]
        
        state = State(state_id=state_id, actions=actions)
        
        assert state.id == state_id
        assert state.actions == actions
        assert isinstance(state.transition_map, dict)
        assert len(state.transition_map) == 0

    def test_state_add_transition(self):
        """Test adding a transition to the state."""
        state = State(state_id="source_state", actions=[])
        
        transition = Transition(
            source_state_id="source_state",
            dest_state_id="target_state",
            input="1",
            actions=[]
        )
        
        state.add_transition(transition)
        
        assert "1" in state.transition_map
        assert state.transition_map["1"] == transition

    def test_state_add_duplicate_transition_raises(self):
        """Test that adding a duplicate transition raises ValueError."""
        state = State(state_id="source_state", actions=[])
        
        t1 = Transition(source_state_id="source_state", dest_state_id="target1", input="1", actions=[])
        t2 = Transition(source_state_id="source_state", dest_state_id="target2", input="1", actions=[])
        
        state.add_transition(t1)
        
        with pytest.raises(ValueError) as exc_info:
            state.add_transition(t2)
        
        assert "Transition for input 1 already exists" in str(exc_info.value)

    def test_state_get_stream_action_with_record_playback_option(self):
        """Test getting stream actions with record playback option."""
        actions = [
            TalkAction(text="Hello"),
            StreamAction(url="https://example.com/audio1.mp3", record_playback_time=True),
            StreamAction(url="https://example.com/audio2.mp3", record_playback_time=False),
            StreamAction(url="https://example.com/audio3.mp3", record_playback_time=True),
            InputAction(type_=["dtmf"], eventApi="/input")
        ]
        
        state = State(state_id="test_state", actions=actions)
        
        record_playback_actions = state.get_stream_action_with_record_playback_option()
        
        assert len(record_playback_actions) == 2
        assert all(isinstance(action, StreamAction) for action in record_playback_actions)
        assert all(action.record_playback_time for action in record_playback_actions)
        assert record_playback_actions[0].url == "https://example.com/audio1.mp3"
        assert record_playback_actions[1].url == "https://example.com/audio3.mp3"

    def test_state_serialize(self):
        """Test serializing the state to JSON."""
        actions = [
            TalkAction(text="Hello world"),
            StreamAction(url="https://example.com/audio.mp3")
        ]
        
        state = State(state_id="test_state", actions=actions)
        
        serialized = state.serialize()
        
        assert isinstance(serialized, dict)
        assert serialized['id'] == "test_state"
        assert 'actions' in serialized
        assert isinstance(serialized['actions'], list)
        assert len(serialized['actions']) == 2