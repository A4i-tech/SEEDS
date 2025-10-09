import pytest
import sys
import os

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from actions.base_actions.talk_action import TalkAction
from base_classes.action import Action

class TestTalkAction:
    """Unit tests for TalkAction class."""
    
    @property
    def texts(self):
        return {
            "sample": "Hello, welcome to the IVR system",
            "simple": "Test message", 
            "hello_world": "Hello world",
            "complex": "Complex test message with unicode: café, naïve",
            "special_chars": "Hello! How are you? Press 1 for English, 2 for Español.",
            "unicode": "Hello 世界 🌍 Ñoño café résumé",
            "whitespace": "Line 1\nLine 2\tTabbed text\r\nCarriage return",
            "long": "A" * 10000
        }
    
    @property
    def configs(self):
        return {
            "basic": {"bargeIn": True, "loop": 2, "language": "en-US"},
            "simple": {"bargeIn": True, "loop": 3},
            "json_test": {"bargeIn": True, "language": "en-US"},
            "deserialization": {"bargeIn": False, "loop": 1},
            "numeric": {"volume": 0.8, "rate": 1.2, "pitch": 0.9},
            "roundtrip": {"bargeIn": True, "loop": 5, "language": "fr-FR", "volume": 0.7, "rate": 1.1},
            "invalid_types": {"invalid_param": None, "number_param": 42}
        }
    
    def create_basic_talk_action(self, text=None, **kwargs):
        """Create a basic TalkAction with default or provided parameters."""
        text = self.texts["sample"] if text is None else text
        return TalkAction(text=text, **kwargs)
    
    def assert_basic_properties(self, action, expected_text):
        """Assert basic TalkAction properties."""
        assert action.text == expected_text and isinstance(action, Action)
    
    def assert_extra_args(self, action, expected_args):
        """Assert extra_args contain expected key-value pairs."""
        assert all(action.extra_args[k] == v for k, v in expected_args.items())
    
    def assert_string_contains(self, str_repr, *expected_contents):
        """Assert string representation contains all expected contents."""
        assert all(content in str_repr for content in expected_contents)
    
    def assert_json_structure(self, json_data, expected_text):
        """Assert JSON serialization structure is correct."""
        assert (json_data["__class__"] == "TalkAction" and 
                json_data["__module__"] == "actions.base_actions.talk_action" and
                "attributes" in json_data and
                json_data["attributes"]["text"] == expected_text)
    
    def _test_serialization_roundtrip(self, action):
        """Helper: Test complete serialization/deserialization roundtrip for any action."""
        # Serialize
        json_data = action.to_json()
        
        # Deserialize
        restored_action = Action.from_json(json_data)
        
        # Verify
        assert isinstance(restored_action, TalkAction)
        assert restored_action.text == action.text
        assert restored_action.extra_args == action.extra_args
        return restored_action

    def test_talk_action_initialization(self):
        """Test TalkAction can be initialized with required parameters."""
        action = self.create_basic_talk_action()
        
        self.assert_basic_properties(action, self.texts["sample"])
        assert action.extra_args == {}

    def test_talk_action_initialization_with_kwargs(self):
        """Test TalkAction initialization with additional kwargs."""
        action = self.create_basic_talk_action(**self.configs["basic"])
        
        self.assert_basic_properties(action, self.texts["sample"])
        self.assert_extra_args(action, self.configs["basic"])

    def test_talk_action_str_representation(self):
        """Test string representation of TalkAction."""
        action = self.create_basic_talk_action(self.texts["simple"])
        
        str_repr = str(action)
        self.assert_string_contains(str_repr, "TalkAction:", self.texts["simple"])

    def test_talk_action_str_representation_with_kwargs(self):
        """Test string representation with extra arguments."""
        action = self.create_basic_talk_action(self.texts["simple"], **self.configs["simple"])
        
        str_repr = str(action)
        self.assert_string_contains(str_repr, "TalkAction:", self.texts["simple"], "bargeIn", "loop")

    def test_talk_action_get_method_not_implemented(self):
        """Test that get() method raises NotImplementedError."""
        action = self.create_basic_talk_action("Test")
        
        with pytest.raises(NotImplementedError) as exc_info:
            action.get(None)
        
        assert "Get() Function called on Base Action `TalkAction`" in str(exc_info.value)

    def test_talk_action_to_json_serialization(self):
        """Test JSON serialization of TalkAction."""
        action = self.create_basic_talk_action(self.texts["hello_world"], **self.configs["json_test"])
        
        json_data = action.to_json()
        
        self.assert_json_structure(json_data, self.texts["hello_world"])
        self.assert_extra_args(action, self.configs["json_test"])

    def test_talk_action_from_json_deserialization(self):
        """Test JSON deserialization of TalkAction."""
        original_action = self.create_basic_talk_action(self.texts["simple"], **self.configs["deserialization"])
        json_data = original_action.to_json()
        
        deserialized_action = Action.from_json(json_data)
        
        assert isinstance(deserialized_action, TalkAction)
        assert deserialized_action.text == original_action.text
        assert deserialized_action.extra_args == original_action.extra_args

    def test_talk_action_repr_method(self):
        """Test __repr__ method returns same as __str__."""
        action = self.create_basic_talk_action("Test repr")
        
        assert repr(action) == str(action)

    def test_talk_action_empty_text(self):
        """Test TalkAction with empty text."""
        action = self.create_basic_talk_action("")
        
        assert action.text == ""
        assert action.extra_args == {}

    def test_talk_action_with_special_characters(self):
        """Test TalkAction with special characters in text."""
        action = self.create_basic_talk_action(self.texts["special_chars"])
        
        self.assert_basic_properties(action, self.texts["special_chars"])
        assert self.texts["special_chars"] in str(action)

    def test_talk_action_with_numeric_kwargs(self):
        """Test TalkAction with numeric keyword arguments."""
        action = self.create_basic_talk_action("Test", **self.configs["numeric"])
        
        self.assert_extra_args(action, self.configs["numeric"])

    def test_talk_action_serialization_roundtrip(self):
        """Test complete serialization and deserialization roundtrip."""
        original_action = self.create_basic_talk_action(self.texts["complex"], **self.configs["roundtrip"])
        
        restored_action = self._test_serialization_roundtrip(original_action)
        
        # Additional verification
        assert str(restored_action) == str(original_action)

    def test_talk_action_with_very_long_text(self):
        """Test TalkAction with extremely long text."""
        action = self.create_basic_talk_action(self.texts["long"])
        assert action.text == self.texts["long"]
        assert len(action.text) == 10000

    def test_talk_action_with_unicode_characters(self):
        """Test TalkAction with Unicode characters."""
        action = self.create_basic_talk_action(self.texts["unicode"])
        self.assert_basic_properties(action, self.texts["unicode"])

    def test_talk_action_with_newlines_and_tabs(self):
        """Test TalkAction with newlines and tab characters."""
        action = self.create_basic_talk_action(self.texts["whitespace"])
        self.assert_basic_properties(action, self.texts["whitespace"])

    def test_talk_action_invalid_kwargs_types(self):
        """Test TalkAction with invalid kwargs types."""
        action = self.create_basic_talk_action("test", **self.configs["invalid_types"])
        # Should not raise, extra kwargs are stored
        self.assert_extra_args(action, self.configs["invalid_types"])
        assert "number_param" in action.extra_args