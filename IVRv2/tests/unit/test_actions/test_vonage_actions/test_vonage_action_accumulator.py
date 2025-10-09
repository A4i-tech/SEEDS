import pytest
import sys
import os
from unittest.mock import MagicMock, patch

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from actions.vonage_actions.vonage_action_accumulator import VonageActionAccumulator
from base_classes.action_accumulator import ActionAccumulator
from base_classes.action import Action


class TestVonageActionAccumulator:
    """Unit tests for VonageActionAccumulator class."""

    @property
    def mock_action_configs(self):
        return {
            "talk": {'action': 'talk', 'text': 'Hello'},
            "stream": {'action': 'stream', 'streamUrl': ['https://example.com/audio.mp3']},
            "input": {'action': 'input', 'type': ['dtmf']},
            "complex_talk": {
                'action': 'talk', 'text': 'Welcome to our service',
                'bargeIn': True, 'loop': 1, 'level': 0.8
            },
            "complex_stream": {
                'action': 'stream', 'streamUrl': ['https://example.com/welcome.mp3?sas=token'],
                'loop': 1, 'bargeIn': False, 'level': 0.9
            },
            "complex_input": {
                'action': 'input', 'type': ['dtmf'],
                'eventUrl': ['https://webhook.example.com/input'],
                'dtmf': {'maxDigits': 1, 'timeOut': 10, 'submitOnHash': False}
            },
            "record": {'action': 'record', 'format': 'mp3'},
            "connect": {'action': 'connect', 'endpoint': [{'type': 'phone', 'number': '123456789'}]},
            "stream_alt": {'action': 'stream', 'streamUrl': ['https://audio.com/file.mp3']}
        }

    def create_accumulator(self):
        """Create a VonageActionAccumulator instance."""
        return VonageActionAccumulator()

    def create_mock_action(self, config_key):
        """Create a mock action with specified configuration."""
        mock_action = MagicMock(spec=Action)
        mock_action.get.return_value = self.mock_action_configs[config_key]
        return mock_action

    def create_mock_actions(self, config_keys):
        """Create multiple mock actions from configuration keys."""
        return [self.create_mock_action(key) for key in config_keys]

    def assert_combine_result(self, result, expected_configs, expected_length=None):
        """Assert combine result matches expected configurations."""
        assert isinstance(result, list)
        if expected_length is not None:
            assert len(result) == expected_length
        else:
            assert len(result) == len(expected_configs)
        
        for i, config_key in enumerate(expected_configs):
            expected = self.mock_action_configs[config_key] if isinstance(config_key, str) else config_key
            assert result[i] == expected

    def assert_actions_called_once(self, mock_actions):
        """Assert all mock actions were called exactly once."""
        for mock_action in mock_actions:
            mock_action.get.assert_called_once()

    def test_vonage_action_accumulator_inheritance(self):
        """Test that VonageActionAccumulator inherits from ActionAccumulator."""
        accumulator = self.create_accumulator()
        assert isinstance(accumulator, ActionAccumulator)

    def test_combine_empty_list(self):
        """Test combining an empty list of actions."""
        result = self.create_accumulator().combine([])
        self.assert_combine_result(result, [], expected_length=0)

    def test_combine_single_action(self):
        """Test combining a single action."""
        mock_action = self.create_mock_action("talk")
        result = self.create_accumulator().combine([mock_action])
        
        self.assert_combine_result(result, ["talk"])
        self.assert_actions_called_once([mock_action])

    def test_combine_multiple_actions(self):
        """Test combining multiple actions."""
        mock_actions = self.create_mock_actions(["talk", "stream", "input"])
        result = self.create_accumulator().combine(mock_actions)
        
        self.assert_combine_result(result, ["talk", "stream", "input"])
        self.assert_actions_called_once(mock_actions)

    def test_combine_actions_with_sas_gen_object(self):
        """Test that actions are called with the SAS generator object."""
        mock_action = MagicMock(spec=Action)
        mock_action.get.return_value = {'action': 'test'}
        
        self.create_accumulator().combine([mock_action])
        
        # Verify the action's get method was called with sas_gen_obj
        mock_action.get.assert_called_once()
        args, kwargs = mock_action.get.call_args
        assert len(args) == 1  # Should be called with one argument (sas_gen_obj)

    def test_combine_preserves_action_order(self):
        """Test that the order of actions is preserved in the result."""
        # Create mock actions with identifiable return values
        actions = []
        expected_configs = []
        
        for i in range(5):
            mock_action = MagicMock(spec=Action)
            config = {'action': 'test', 'order': i}
            mock_action.get.return_value = config
            actions.append(mock_action)
            expected_configs.append(config)
        
        result = self.create_accumulator().combine(actions)
        
        self.assert_combine_result(result, expected_configs, expected_length=5)

    def test_combine_handles_action_exceptions(self):
        """Test behavior when an action's get method raises an exception."""
        mock_action = MagicMock(spec=Action)
        mock_action.get.side_effect = Exception("Action failed")
        
        with pytest.raises(Exception, match="Action failed"):
            self.create_accumulator().combine([mock_action])

    def test_combine_with_complex_ncco_actions(self):
        """Test combining actions that return complex NCCO structures."""
        mock_actions = self.create_mock_actions(["complex_talk", "complex_stream", "complex_input"])
        result = self.create_accumulator().combine(mock_actions)
        
        self.assert_combine_result(result, ["complex_talk", "complex_stream", "complex_input"])
        
        assert result[0]['bargeIn'] is True
        assert 'sas=token' in result[1]['streamUrl'][0]
        assert 'dtmf' in result[2]

    def test_combine_different_action_types(self):
        """Test combining different types of Vonage actions."""
        action_keys = ["talk", "stream", "input", "record", "connect"]
        mock_actions = self.create_mock_actions(action_keys)
        result = self.create_accumulator().combine(mock_actions)
        
        self.assert_combine_result(result, action_keys)

    def test_combine_returns_list_not_generator(self):
        """Test that combine returns a list, not a generator."""
        mock_action = MagicMock(spec=Action)
        mock_action.get.return_value = {'action': 'test'}
        
        result = self.create_accumulator().combine([mock_action])
        
        assert isinstance(result, list) and not hasattr(result, '__next__')

    def test_combine_handles_none_return_values(self):
        """Test behavior when an action's get method returns None."""
        mock_action = MagicMock(spec=Action)
        mock_action.get.return_value = None
        
        result = self.create_accumulator().combine([mock_action])
        
        assert len(result) == 1 and result[0] is None