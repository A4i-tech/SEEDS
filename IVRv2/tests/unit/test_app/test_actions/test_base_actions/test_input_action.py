import pytest
import sys
import os

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from app.actions.base_actions.input_action import InputAction
from app.base_classes.action import Action


class TestInputAction:
    """Unit tests for InputAction class."""
    
    @property
    def sample_dtmf_type(self):
        return ["dtmf"]
    
    @property
    def sample_speech_type(self):
        return ["speech"]
    
    @property
    def sample_mixed_types(self):
        return ["dtmf", "speech"]
    
    @property
    def sample_eventApi(self):
        return "https://example.com/input"
    
    @property
    def sample_speech_eventApi(self):
        return "https://example.com/speech"
    
    @property
    def basic_dtmf_config(self):
        return {"maxDigits": 5, "timeOut": 10, "submitOnHash": True}
    
    def create_basic_input_action(self, type_=None, eventApi=None, **kwargs):
        """Create a basic InputAction with default or provided parameters."""
        if type_ is None:
            type_ = self.sample_dtmf_type
        if eventApi is None:
            eventApi = self.sample_eventApi
        return InputAction(type_=type_, eventApi=eventApi, **kwargs)
    
    def assert_basic_properties(self, action, expected_type, expected_eventApi):
        """Assert basic InputAction properties."""
        assert action.type == expected_type
        assert action.eventApi == expected_eventApi
        assert isinstance(action, Action)
    
    def assert_extra_args(self, action, expected_args):
        """Assert extra_args contain expected key-value pairs."""
        for key, value in expected_args.items():
            assert action.extra_args[key] == value
    
    def assert_string_contains(self, str_repr, *expected_contents):
        """Assert string representation contains all expected contents."""
        for content in expected_contents:
            assert content in str_repr
    
    def assert_json_structure(self, json_data, expected_type, expected_eventApi):
        """Assert JSON serialization structure is correct."""
        assert json_data["__class__"] == "InputAction"
        assert json_data["__module__"] == "app.actions.base_actions.input_action"
        assert "attributes" in json_data
        assert json_data["attributes"]["type"] == expected_type
        assert json_data["attributes"]["eventApi"] == expected_eventApi
    
    def _test_serialization_roundtrip(self, action):
        """Helper: Test complete serialization/deserialization roundtrip for any action."""
        # Serialize
        json_data = action.to_json()
        
        # Deserialize
        restored_action = Action.from_json(json_data)
        
        # Verify
        assert isinstance(restored_action, InputAction)
        assert restored_action.type == action.type
        assert restored_action.eventApi == action.eventApi
        assert restored_action.extra_args == action.extra_args
        return restored_action

    def test_input_action_initialization(self):
        """Test InputAction can be initialized with required parameters."""
        action = self.create_basic_input_action()
        
        self.assert_basic_properties(action, self.sample_dtmf_type, self.sample_eventApi)
        assert action.extra_args == {}

    def test_input_action_initialization_with_kwargs(self):
        """Test InputAction initialization with additional kwargs."""
        action = self.create_basic_input_action(**self.basic_dtmf_config)
        
        self.assert_basic_properties(action, self.sample_dtmf_type, self.sample_eventApi)
        self.assert_extra_args(action, self.basic_dtmf_config)

    def test_input_action_with_speech_type(self):
        """Test InputAction with speech input type."""
        action = self.create_basic_input_action(
            type_=self.sample_speech_type, 
            eventApi=self.sample_speech_eventApi
        )
        
        self.assert_basic_properties(action, self.sample_speech_type, self.sample_speech_eventApi)

    def test_input_action_with_multiple_types(self):
        """Test InputAction with multiple input types."""
        action = self.create_basic_input_action(type_=self.sample_mixed_types)
        
        self.assert_basic_properties(action, self.sample_mixed_types, self.sample_eventApi)
        assert len(action.type) == 2
        assert "dtmf" in action.type
        assert "speech" in action.type

    def test_input_action_str_representation(self):
        """Test string representation of InputAction."""
        action = self.create_basic_input_action()
        
        str_repr = str(action)
        self.assert_string_contains(str_repr, "InputAction:", "dtmf", self.sample_eventApi)

    def test_input_action_str_representation_with_kwargs(self):
        """Test string representation with extra arguments."""
        action = self.create_basic_input_action(maxDigits=3, timeOut=5)
        
        str_repr = str(action)
        self.assert_string_contains(
            str_repr, "InputAction:", "dtmf", self.sample_eventApi, "maxDigits", "timeOut"
        )

    def test_input_action_get_method_not_implemented(self):
        """Test that get() method raises NotImplementedError."""
        action = self.create_basic_input_action()
        
        with pytest.raises(NotImplementedError) as exc_info:
            action.get(None)
        
        assert "Get() Function called on Base Action `InputAction`" in str(exc_info.value)

    def test_input_action_to_json_serialization(self):
        """Test JSON serialization of InputAction."""
        test_kwargs = {"maxDigits": 6, "submitOnHash": True}
        action = self.create_basic_input_action(**test_kwargs)
        
        json_data = action.to_json()
        
        self.assert_json_structure(json_data, self.sample_dtmf_type, self.sample_eventApi)
        for key, value in test_kwargs.items():
            assert json_data["attributes"]["extra_args"][key] == value

    def test_input_action_from_json_deserialization(self):
        """Test JSON deserialization of InputAction."""
        test_kwargs = {"maxDigits": 4, "timeOut": 15, "submitOnHash": False}
        original_action = self.create_basic_input_action(
            type_=self.sample_mixed_types,
            eventApi="https://test.com/input",
            **test_kwargs
        )
        
        self._test_serialization_roundtrip(original_action)

