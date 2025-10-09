import pytest
import sys
import os

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from base_classes.action_accumulator import ActionAccumulator
from base_classes.action import Action
from actions.base_actions.talk_action import TalkAction
from actions.base_actions.stream_action import StreamAction


class TestConcreteActionAccumulator(ActionAccumulator):
    """Concrete implementation of ActionAccumulator for testing purposes."""
    
    def combine(self, actions: list[Action]):
        """Simple implementation that returns a list of action strings."""
        if not actions:
            return []
        
        result = []
        for action in actions:
            if hasattr(action, 'text'):
                result.append(f"talk:{action.text}")
            elif hasattr(action, 'url'):
                result.append(f"stream:{action.url}")
            else:
                result.append(f"action:{str(action)}")
        
        return result


class TestActionAccumulator:
    """Unit tests for ActionAccumulator abstract base class."""

    @property
    def text_samples(self):
        return {
            "hello": "Hello",
            "single": "Single action",
            "first": "First", 
            "second": "Second",
            "third": "Third",
            "talk": "Talk action",
            "another_talk": "Another talk",
            "test": "Test"
        }

    @property
    def url_samples(self):
        return {
            "basic": "https://example.com/audio.mp3",
            "stream": "https://example.com/stream.mp3", 
            "another": "https://example.com/another.mp3"
        }

    @property
    def expected_results(self):
        return {
            "talk_hello": "talk:Hello",
            "stream_basic": "stream:https://example.com/audio.mp3",
            "talk_single": "talk:Single action",
            "talk_first": "talk:First",
            "talk_second": "talk:Second", 
            "talk_third": "talk:Third",
            "talk_action": "talk:Talk action",
            "stream_stream": "stream:https://example.com/stream.mp3",
            "talk_another": "talk:Another talk",
            "stream_another": "stream:https://example.com/another.mp3"
        }

    def create_accumulator(self):
        """Create a TestConcreteActionAccumulator instance."""
        return TestConcreteActionAccumulator()

    def create_talk_action(self, text_key):
        """Create a TalkAction with specified text from samples."""
        return TalkAction(text=self.text_samples[text_key])

    def create_stream_action(self, url_key):
        """Create a StreamAction with specified URL from samples."""
        return StreamAction(url=self.url_samples[url_key])

    def create_multiple_talk_actions(self, text_keys):
        """Create multiple TalkActions from text key list."""
        return [self.create_talk_action(key) for key in text_keys]

    def create_mixed_actions(self, action_specs):
        """Create mixed actions from specifications like [('talk', 'hello'), ('stream', 'basic')]."""
        actions = []
        for action_type, key in action_specs:
            if action_type == 'talk':
                actions.append(self.create_talk_action(key))
            elif action_type == 'stream':
                actions.append(self.create_stream_action(key))
        return actions

    def assert_result_contains_expected(self, result, expected_keys):
        """Assert result contains all expected values by key."""
        for key in expected_keys:
            assert self.expected_results[key] in result

    def assert_basic_result_properties(self, result, expected_length):
        """Assert basic result properties."""
        assert isinstance(result, list) and len(result) == expected_length

    def test_action_accumulator_is_abstract(self):
        """Test that ActionAccumulator cannot be instantiated directly."""
        with pytest.raises(TypeError):
            ActionAccumulator()

    def test_concrete_action_accumulator_implementation(self):
        """Test concrete implementation of ActionAccumulator."""
        actions = self.create_mixed_actions([('talk', 'hello'), ('stream', 'basic')])
        result = self.create_accumulator().combine(actions)
        
        self.assert_basic_result_properties(result, 2)
        self.assert_result_contains_expected(result, ["talk_hello", "stream_basic"])

    def test_action_accumulator_with_empty_list(self):
        """Test ActionAccumulator with empty action list."""
        result = self.create_accumulator().combine([])
        assert result == []

    def test_action_accumulator_with_single_action(self):
        """Test ActionAccumulator with single action."""
        actions = [self.create_talk_action("single")]
        result = self.create_accumulator().combine(actions)
        
        assert len(result) == 1 and result[0] == self.expected_results["talk_single"]

    def test_action_accumulator_with_multiple_same_type_actions(self):
        """Test ActionAccumulator with multiple actions of same type."""
        actions = self.create_multiple_talk_actions(["first", "second", "third"])
        result = self.create_accumulator().combine(actions)
        
        self.assert_basic_result_properties(result, 3)
        self.assert_result_contains_expected(result, ["talk_first", "talk_second", "talk_third"])

    def test_action_accumulator_with_mixed_action_types(self):
        """Test ActionAccumulator with different types of actions."""
        actions = self.create_mixed_actions([
            ('talk', 'talk'), ('stream', 'stream'), 
            ('talk', 'another_talk'), ('stream', 'another')
        ])
        result = self.create_accumulator().combine(actions)
        
        self.assert_basic_result_properties(result, 4)
        self.assert_result_contains_expected(result, [
            "talk_action", "stream_stream", "talk_another", "stream_another"
        ])

    def test_action_accumulator_combine_method_signature(self):
        """Test that combine method has correct signature."""
        actions = [self.create_talk_action("test")]
        result = self.create_accumulator().combine(actions)
        
        assert result is not None

    def test_action_accumulator_with_none_input(self):
        """Test ActionAccumulator behavior with None input."""
        # The concrete implementation treats None as falsy and returns empty list
        result = self.create_accumulator().combine(None)
        assert result == []

    def test_action_accumulator_inheritance(self):
        """Test that TestConcreteActionAccumulator properly inherits from ActionAccumulator."""
        accumulator = self.create_accumulator()
        
        assert (isinstance(accumulator, ActionAccumulator) and 
                hasattr(accumulator, 'combine') and 
                callable(accumulator.combine))