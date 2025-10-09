import pytest
import sys
import os
from unittest.mock import MagicMock
from datetime import datetime

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from base_classes.base_fsm_operation import FSMOperation
from fsm.fsm import FSM
from utils.model_classes import IVRCallStateMongoDoc


class TestConcreteFSMOperation(FSMOperation):
    """Concrete implementation of FSMOperation for testing purposes."""
    
    def __init__(self, return_value="test_result"):
        self.return_value = return_value
        self.executed = False
        
    def execute(self, fsm: FSM, fsm_state_doc: IVRCallStateMongoDoc = None):
        self.executed = True
        if fsm_state_doc:
            return f"{self.return_value}:{fsm_state_doc.current_state_id}"
        return self.return_value
    
    def __str__(self):
        return f"TestConcreteFSMOperation({self.return_value})"


class TestFSMOperation:
    """Unit tests for FSMOperation abstract base class."""

    @property
    def d(self): return {k: k for k in ["hello", "test", "serialize_test", "deserialize_test", "roundtrip_test", "repr_test", "none_test", "multi_test"]}
    def op(self, v="test"): return TestConcreteFSMOperation(v)
    def fsm(self): return MagicMock(spec=FSM)
    def doc(self, s="state1"): return IVRCallStateMongoDoc(_id="test_call", phone_number="+1234567890", fsm_id="test_fsm", current_state_id=s, created_at=datetime.now())
    def json_fix(self, j): j["__module__"] = "tests.unit.test_base_classes.test_base_fsm_operation"; return j
    def assert_json_struct(self, j, cls, val): assert isinstance(j, dict) and j["__class__"] == cls and j["__module__"] and "attributes" in j and j["attributes"]["return_value"] == val
    def exec_test(self, val, doc=None, expected=None): op = self.op(val); result = op.execute(self.fsm()) if doc is None else op.execute(self.fsm(), doc); assert result == (expected or val) and op.executed; return op, result
    def roundtrip(self, val): return FSMOperation.from_json(self.json_fix(self.op(val).to_json()))

    def test_fsm_operation_is_abstract(self):
        """Test that FSMOperation cannot be instantiated directly."""
        with pytest.raises(TypeError): FSMOperation()

    def test_concrete_fsm_operation_implementation(self):
        """Test concrete implementation of FSMOperation."""
        self.exec_test(self.d["hello"])

    def test_fsm_operation_with_fsm_state_doc(self):
        """Test FSMOperation with IVRCallStateMongoDoc parameter."""
        self.exec_test(self.d["test"], self.doc("state1"), "test:state1")

    def test_fsm_operation_repr_calls_str(self):
        """Test that __repr__ method calls __str__."""
        op = self.op(self.d["repr_test"]); assert repr(op) == str(op) == "TestConcreteFSMOperation(repr_test)"

    def test_fsm_operation_to_json_serialization(self):
        """Test FSMOperation serialization to JSON."""
        self.assert_json_struct(self.op(self.d["serialize_test"]).to_json(), "TestConcreteFSMOperation", "serialize_test")

    def test_fsm_operation_from_json_deserialization(self):
        """Test FSMOperation deserialization from JSON."""
        assert self.roundtrip(self.d["deserialize_test"]).return_value == "deserialize_test"

    def test_fsm_operation_serialization_roundtrip(self):
        """Test complete serialization/deserialization roundtrip."""
        original = self.op(self.d["roundtrip_test"]); restored = self.roundtrip(self.d["roundtrip_test"]); assert restored.return_value == original.return_value and str(restored) == str(original)

    def test_fsm_operation_with_none_fsm_state_doc(self):
        """Test FSMOperation with None fsm_state_doc."""
        self.exec_test(self.d["none_test"])

    def test_fsm_operation_multiple_executions(self):
        """Test FSMOperation can be executed multiple times."""
        op, fsm = self.op(self.d["multi_test"]), self.fsm(); assert op.execute(fsm) == op.execute(fsm) == "multi_test" and op.executed

    def test_fsm_operation_inheritance(self):
        """Test that TestConcreteFSMOperation properly inherits from FSMOperation."""
        op = self.op(); assert isinstance(op, FSMOperation) and hasattr(op, 'execute') and callable(op.execute)

    def test_fsm_operation_with_complex_attributes(self):
        """Test FSMOperation with complex attribute types."""
        op = self.op(); setattr(op, 'complex_data', {"list": [1, 2, 3], "dict": {"nested": "value"}, "boolean": True}); restored = FSMOperation.from_json(self.json_fix(op.to_json())); assert hasattr(restored, 'complex_data') and getattr(restored, 'complex_data') == getattr(op, 'complex_data')

    def test_fsm_operation_from_json_invalid_module(self):
        """Test FSMOperation deserialization with invalid module."""
        with pytest.raises((ImportError, ModuleNotFoundError)): FSMOperation.from_json({"__class__": "NonExistentOperation", "__module__": "non_existent_module", "attributes": {"test": "value"}})

    def test_fsm_operation_from_json_invalid_class(self):
        """Test FSMOperation deserialization with invalid class name."""
        with pytest.raises(AttributeError): FSMOperation.from_json({"__class__": "NonExistentOperation", "__module__": "tests.unit.test_base_classes.test_base_fsm_operation", "attributes": {"test": "value"}})