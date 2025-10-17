import pytest
import sys
import os

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from app.base_classes.action import Action
from app.actions.base_actions.talk_action import TalkAction


class ConcreteActionForTesting(Action):
    """Concrete implementation of Action for testing purposes."""
    
    def __init__(self, test_value="test"):
        self.test_value = test_value
        
    def get(self, sas_gen_obj):
        return {"test": self.test_value}
    
    def __str__(self):
        return f"ConcreteActionForTesting: {self.test_value}"


class TestAction:
    """Unit tests for Action abstract base class."""

    @property
    def d(self): return {"hello": "hello", "serialize_test": "serialize_test", "deserialize_test": "deserialize_test", "roundtrip_test": "roundtrip_test", "test_repr": "test_repr"}
    def a(self, v="test"): return ConcreteActionForTesting(v)
    def json_fix(self, j): j["__module__"] = "tests.unit.test_app.base_classes.test_action"; return j
    def assert_json_struct(self, j, cls, val): assert isinstance(j, dict) and j["__class__"] == cls and j["__module__"] and "attributes" in j and j["attributes"]["test_value"] == val

    def test_action_is_abstract(self):
        """Test that Action cannot be instantiated directly."""
        with pytest.raises(TypeError): Action()

    def test_concrete_action_implementation(self):
        """Test concrete implementation of Action."""
        action = self.a(self.d["hello"])
        assert action.test_value == "hello" and action.get(None) == {"test": "hello"}

    def test_action_repr_calls_str(self):
        """Test that __repr__ method calls __str__."""
        action = self.a(self.d["test_repr"])
        assert repr(action) == str(action) == "ConcreteActionForTesting: test_repr"

    def test_action_to_json_serialization(self):
        """Test Action serialization to JSON."""
        action = self.a(self.d["serialize_test"])
        self.assert_json_struct(action.to_json(), "ConcreteActionForTesting", "serialize_test")

    def test_action_from_json_deserialization(self):
        """Test Action deserialization from JSON."""
        original = self.a("deserialize_test")
        json_data = self.json_fix(original.to_json())
        deserialized = Action.from_json(json_data)
        assert deserialized.test_value == "deserialize_test" and deserialized.get(None) == {"test": "deserialize_test"}

    def test_action_serialization_roundtrip(self):
        """Test complete serialization/deserialization roundtrip."""
        original = self.a("roundtrip_test")
        restored = Action.from_json(self.json_fix(original.to_json()))
        assert restored.test_value == original.test_value and str(restored) == str(original)

    def test_action_with_existing_action_class(self):
        """Test serialization/deserialization with existing TalkAction."""
        talk_action = TalkAction(text="Hello World")
        restored = Action.from_json(talk_action.to_json())
        assert isinstance(restored, TalkAction) and restored.text == "Hello World"

    def test_action_with_complex_attributes(self):
        """Test Action with complex attribute types."""
        action = self.a(); setattr(action, 'complex_data', {"list": [1, 2, 3], "dict": {"nested": "value"}, "string": "test", "number": 42}); restored = Action.from_json(self.json_fix(action.to_json())); assert getattr(restored, 'complex_data') == getattr(action, 'complex_data')

    def test_action_with_none_attributes(self):
        """Test Action with None attributes."""
        action = self.a(); [setattr(action, a, v) for a, v in [('none_value', None), ('empty_string', ""), ('zero_value', 0)]]; restored = Action.from_json(self.json_fix(action.to_json())); assert all(getattr(restored, a) == v for a, v in [('none_value', None), ('empty_string', ""), ('zero_value', 0)])

    def test_action_from_json_invalid_module(self):
        """Test Action deserialization with invalid module."""
        with pytest.raises((ImportError, ModuleNotFoundError)): Action.from_json({"__class__": "NonExistentClass", "__module__": "non_existent_module", "attributes": {"test": "value"}})

    def test_action_from_json_invalid_class(self):
        """Test Action deserialization with invalid class name."""
        with pytest.raises(AttributeError): Action.from_json({"__class__": "NonExistentClass", "__module__": "tests.unit.test_app.base_classes.test_action", "attributes": {"test": "value"}})