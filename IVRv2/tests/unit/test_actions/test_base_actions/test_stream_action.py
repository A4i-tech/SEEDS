import pytest
import sys
import os

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from actions.base_actions.stream_action import StreamAction
from base_classes.action import Action


class TestStreamAction:
    """Unit tests for StreamAction class."""
    
    SAMPLE_URL = "https://example.com/audio.mp3"
    TEST_URL = "https://example.com/test.mp3"
    
    def _create_action(self, url=None, record_playback_time=False, **kwargs):
        """Helper method to create StreamAction instances"""
        return StreamAction(url=url or self.SAMPLE_URL, record_playback_time=record_playback_time, **kwargs)
    
    def _assert_basic_properties(self, action, expected_url, expected_record_playback=False):
        """Helper method to assert basic properties"""
        assert action.url == expected_url
        assert action.record_playback_time == expected_record_playback
        assert isinstance(action, Action)

    def test_stream_action_initialization(self):
        """Test StreamAction can be initialized with required parameters."""
        action = self._create_action()
        
        self._assert_basic_properties(action, self.SAMPLE_URL)
        assert action.extra_args == {}

    def test_stream_action_initialization_with_kwargs(self):
        """Test StreamAction initialization with additional kwargs."""
        action = self._create_action(record_playback_time=True, volume=0.5, loop=3)
        
        self._assert_basic_properties(action, self.SAMPLE_URL, expected_record_playback=True)
        assert action.extra_args["volume"] == 0.5
        assert action.extra_args["loop"] == 3

    def test_stream_action_get_method_not_implemented(self):
        """Test that get() method raises NotImplementedError."""
        action = self._create_action(url=self.TEST_URL)
        
        with pytest.raises(NotImplementedError) as exc_info:
            action.get(None)
        
        assert "Get() Function called on Base Action `StreamAction`" in str(exc_info.value)

    def test_stream_action_to_json_serialization(self):
        """Test JSON serialization of StreamAction."""
        action = self._create_action(record_playback_time=True, volume=0.6)
        
        json_data = action.to_json()
        
        assert json_data["__class__"] == "StreamAction"
        assert json_data["__module__"] == "actions.base_actions.stream_action"
        assert json_data["attributes"]["url"] == self.SAMPLE_URL
        assert json_data["attributes"]["record_playback_time"] == True
        assert json_data["attributes"]["extra_args"]["volume"] == 0.6