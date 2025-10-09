import pytest
import sys
import os
from unittest.mock import MagicMock
from datetime import datetime

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from base_classes.base_process_operation_output import ProcessOperationOutput
from base_classes.action import Action
from actions.base_actions.talk_action import TalkAction
from actions.base_actions.stream_action import StreamAction
from utils.model_classes import IVRCallStateMongoDoc


class TestConcreteProcessOperationOutput(ProcessOperationOutput):
    """Concrete implementation of ProcessOperationOutput for testing purposes."""
    
    def __init__(self, result_actions=None):
        self.result_actions = result_actions if result_actions is not None else [TalkAction(text="Default action")]
        self.executed = False
        
    def execute(self, state, op_output, fsm_state_doc: IVRCallStateMongoDoc = None):
        self.executed = True
        
        # Simple logic based on inputs
        if op_output == "error":
            return [TalkAction(text="Error occurred")]
        elif op_output == "success":
            return [TalkAction(text="Success"), StreamAction(url="https://example.com/success.mp3")]
        elif state and hasattr(state, 'actions'):
            return state.actions
        else:
            return self.result_actions
    
    def __str__(self):
        return f"TestConcreteProcessOperationOutput(actions={len(self.result_actions)})"


class TestProcessOperationOutput:
    """Unit tests for ProcessOperationOutput abstract base class."""


    @property
    def actions(self): return {"test": [TalkAction(text="Test action")], "default": [TalkAction(text="Default action")], "serialize": [TalkAction(text="Serialize test")], "roundtrip": [TalkAction(text="Roundtrip test")], "empty": []}
    def proc(self, acts=None): return TestConcreteProcessOperationOutput(acts if acts is not None else self.actions["default"])
    def state(self): s = MagicMock(); s.actions = [TalkAction(text="State action 1"), StreamAction(url="https://example.com/state.mp3")]; return s
    def doc(self, s="state1"): return IVRCallStateMongoDoc(_id="test_call", phone_number="+1234567890", fsm_id="test_fsm", current_state_id=s, created_at=datetime.now())
    def json_fix(self, j): j["__module__"] = "tests.unit.test_base_classes.test_base_process_operation_output"; return j
    def roundtrip(self, acts=None): return ProcessOperationOutput.from_json(self.json_fix(self.proc(acts).to_json()))
    def exec_test(self, state=None, output=None, doc=None, expected_len=1): p = self.proc(); result = p.execute(state, output) if doc is None else p.execute(state, output, doc); assert isinstance(result, list) and len(result) == expected_len and p.executed; return result

    def test_process_operation_output_is_abstract(self):
        """Test that ProcessOperationOutput cannot be instantiated directly."""
        with pytest.raises(TypeError): ProcessOperationOutput()

    def test_concrete_process_operation_output_implementation(self):
        """Test concrete implementation of ProcessOperationOutput."""
        result = self.exec_test(); assert isinstance(result[0], TalkAction) and result[0].text == "Default action"

    def test_process_operation_output_with_state(self):
        """Test ProcessOperationOutput with state parameter."""
        result = self.exec_test(self.state(), None, None, 2); assert isinstance(result[0], TalkAction) and isinstance(result[1], StreamAction)

    def test_process_operation_output_with_operation_output(self):
        """Test ProcessOperationOutput with different operation outputs."""
        error_result = self.exec_test(None, "error"); assert error_result[0].text == "Error occurred"
        success_result = self.exec_test(None, "success", None, 2); assert success_result[0].text == "Success" and isinstance(success_result[1], StreamAction)

    def test_process_operation_output_with_fsm_state_doc(self):
        """Test ProcessOperationOutput with IVRCallStateMongoDoc parameter."""
        self.exec_test(None, None, self.doc())

    def test_process_operation_output_repr_calls_str(self):
        """Test that __repr__ method calls __str__."""
        proc = self.proc(); assert repr(proc) == str(proc) and "TestConcreteProcessOperationOutput" in repr(proc)

    def test_process_operation_output_to_json_serialization(self):
        """Test ProcessOperationOutput serialization to JSON."""
        j = self.proc(self.actions["serialize"]).to_json(); assert isinstance(j, dict) and j["__class__"] == "TestConcreteProcessOperationOutput" and j["__module__"] == "test_base_process_operation_output" and "attributes" in j

    def test_process_operation_output_from_json_deserialization(self):
        """Test ProcessOperationOutput deserialization from JSON."""
        deserialized = self.roundtrip(); assert deserialized.__class__.__name__ == "TestConcreteProcessOperationOutput"

    def test_process_operation_output_serialization_roundtrip(self):
        """Test complete serialization/deserialization roundtrip."""
        original = self.proc(self.actions["roundtrip"]); restored = self.roundtrip(self.actions["roundtrip"]); assert str(restored) == str(original)

    def test_process_operation_output_returns_action_list(self):
        """Test that ProcessOperationOutput returns list of Action objects."""
        result = self.exec_test(); assert all(isinstance(action, Action) for action in result)

    def test_process_operation_output_with_empty_result(self):
        """Test ProcessOperationOutput with empty action list."""
        p = self.proc(self.actions["empty"]); result = p.execute(None, None); assert isinstance(result, list) and len(result) == 0

    def test_process_operation_output_multiple_executions(self):
        """Test ProcessOperationOutput can be executed multiple times."""
        p = self.proc(); result1, result2 = p.execute(None, "error"), p.execute(None, "success"); assert len(result1) == 1 and len(result2) == 2 and result1[0].text == "Error occurred" and result2[0].text == "Success"

    def test_process_operation_output_inheritance(self):
        """Test that TestConcreteProcessOperationOutput properly inherits from ProcessOperationOutput."""
        proc = self.proc(); assert isinstance(proc, ProcessOperationOutput) and hasattr(proc, 'execute') and callable(proc.execute)

    def test_process_operation_output_from_json_invalid_module(self):
        """Test ProcessOperationOutput deserialization with invalid module."""
        with pytest.raises((ImportError, ModuleNotFoundError)): ProcessOperationOutput.from_json({"__class__": "NonExistentProcessor", "__module__": "non_existent_module", "attributes": {"test": "value"}})

    def test_process_operation_output_from_json_invalid_class(self):
        """Test ProcessOperationOutput deserialization with invalid class name."""
        with pytest.raises(AttributeError): ProcessOperationOutput.from_json({"__class__": "NonExistentProcessor", "__module__": "tests.unit.test_base_classes.test_base_process_operation_output", "attributes": {"test": "value"}})