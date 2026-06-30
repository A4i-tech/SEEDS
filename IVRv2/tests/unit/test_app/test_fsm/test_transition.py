import pytest
import sys
import os

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from app.fsm.transition import Transition
from app.actions.base_actions.talk_action import TalkAction
from app.actions.base_actions.stream_action import StreamAction
from app.actions.base_actions.input_action import InputAction
from app.base_classes.action import Action


class TestTransition:
    """Unit tests for Transition class."""

    def test_transition_initialization(self):
        """Test Transition can be initialized with required parameters."""
        source_state_id = "state1"
        dest_state_id = "state2"
        input_key = "1"
        actions = []
        
        transition = Transition(
            source_state_id=source_state_id,
            dest_state_id=dest_state_id,
            input=input_key,
            actions=actions
        )
        
        assert transition.source_state_id == source_state_id
        assert transition.dest_state_id == dest_state_id
        assert transition.input == input_key
        assert transition.actions == actions

    def test_transition_initialization_with_actions(self):
        """Test Transition initialization with action list."""
        actions = [
            TalkAction(text="Transitioning to next state"),
            StreamAction(url="https://example.com/transition.mp3")
        ]
        
        transition = Transition(
            source_state_id="start",
            dest_state_id="menu",
            input="1",
            actions=actions
        )
        
        assert len(transition.actions) == 2
        assert transition.actions == actions
        assert isinstance(transition.actions[0], TalkAction)
        assert isinstance(transition.actions[1], StreamAction)

    def test_transition_to_json_serialization(self):
        """Test JSON serialization of Transition."""
        actions = [
            TalkAction(text="Moving to customer service"),
            StreamAction(url="https://example.com/hold.mp3")
        ]
        
        transition = Transition(
            source_state_id="main_menu",
            dest_state_id="customer_service",
            input="1",
            actions=actions
        )
        
        json_data = transition.to_json()
        
        assert isinstance(json_data, dict)
        assert json_data['input'] == "1"
        assert json_data['source_state_id'] == "main_menu"
        assert json_data['dest_state_id'] == "customer_service"
        assert 'actions' in json_data
        assert isinstance(json_data['actions'], list)
        assert len(json_data['actions']) == 2