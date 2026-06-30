import pytest
import sys
import os
from unittest.mock import MagicMock
from datetime import datetime

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from app.fsm.operations.empty_state_operation import EmptyStateOperation
from app.fsm.operations.empty_process_state_output import EmptyProcessStateOutput
from app.base_classes.base_fsm_operation import FSMOperation
from app.base_classes.base_process_operation_output import ProcessOperationOutput
from app.base_classes.action import Action
from app.actions.base_actions.talk_action import TalkAction
from app.actions.base_actions.stream_action import StreamAction
from app.fsm.fsm import FSM
from app.fsm.state import State
from app.utils.model_classes import IVRCallStateMongoDoc


class TestEmptyStateOperation:
    """Unit tests for EmptyStateOperation class."""

    def test_empty_state_operation_execute_returns_none(self):
        """Test that EmptyStateOperation.execute returns None."""
        operation = EmptyStateOperation()
        fsm = MagicMock(spec=FSM)
        
        result = operation.execute(fsm)
        assert result is None

    def test_empty_state_operation_serialization(self):
        """Test EmptyStateOperation serialization."""
        operation = EmptyStateOperation()
        json_data = operation.to_json()
        
        assert isinstance(json_data, dict)
        assert json_data["__class__"] == "EmptyStateOperation"
        assert json_data["__module__"] == "app.fsm.operations.empty_state_operation"


class TestEmptyProcessStateOutput:
    """Unit tests for EmptyProcessStateOutput class."""

    def test_empty_process_state_output_returns_state_actions(self):
        """Test that EmptyProcessStateOutput returns state.actions."""
        processor = EmptyProcessStateOutput()
        
        # Create a mock state with actions
        mock_state = MagicMock()
        mock_state.actions = [
            TalkAction(text="Action 1"),
            StreamAction(url="https://example.com/audio.mp3"),
            TalkAction(text="Action 2")
        ]
        
        result = processor.execute(mock_state, None)
        
        assert result == mock_state.actions
        assert len(result) == 3
        assert isinstance(result[0], TalkAction)
        assert isinstance(result[1], StreamAction)
        assert isinstance(result[2], TalkAction)

    def test_empty_process_state_output_serialization(self):
        """Test EmptyProcessStateOutput serialization."""
        processor = EmptyProcessStateOutput()
        json_data = processor.to_json()
        
        assert isinstance(json_data, dict)
        assert json_data["__class__"] == "EmptyProcessStateOutput"
        assert json_data["__module__"] == "app.fsm.operations.empty_process_state_output"