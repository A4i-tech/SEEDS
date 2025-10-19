import pytest
import sys
import os
from unittest.mock import patch, MagicMock

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from app.actions.vonage_actions.vonage_action_factory import VonageActionFactory
from app.actions.vonage_actions.vonage_action_accumulator import VonageActionAccumulator
from app.actions.vonage_actions.vonage_talk_action import VonageTalkAction
from app.actions.vonage_actions.vonage_stream_action import VonageStreamAction
from app.actions.vonage_actions.vonage_input_action import VonageInputAction
from app.actions.base_actions.talk_action import TalkAction
from app.actions.base_actions.stream_action import StreamAction
from app.actions.base_actions.input_action import InputAction
from app.base_classes.action_factory import ActionFactory


class TestVonageActionFactory:
    """Unit tests for VonageActionFactory class."""

    @property
    def test_ngrok_urls(self):
        return {
            "default": "https://test.ngrok.io",
            "custom": "https://custom.ngrok.io"
        }

    @property
    def talk_action_configs(self):
        return {
            "basic": {"text": "Hello world", "bargeIn": True, "loop": 2, "language": "en-GB"},
            "simple": {"text": "Test message"},
            "complete": {"text": "Complete test message", "volume": 0.9, "bargeIn": False, "loop": 5, "language": "fr-FR"},
            "volume_test": {"text": "Test", "volume": 0.5},
            "barge_test": {"text": "Test", "bargeIn": True}
        }

    @property
    def stream_action_configs(self):
        return {
            "basic": {"url": "https://example.com/audio.mp3", "volume": 0.8, "bargeIn": False, "loop": 3},
            "simple": {"url": "https://example.com/test.wav"},
            "complete": {"url": "https://storage.example.com/audio/complex.mp3", "record_playback_time": True, "volume": 0.7, "bargeIn": True, "loop": 2},
            "volume_test": {"url": "https://test.com/audio.mp3", "volume": 0.5},
            "barge_test": {"url": "https://test.com/audio.mp3", "bargeIn": True}
        }

    @property
    def input_action_configs(self):
        return {
            "basic": {"type_": ["dtmf"], "eventApi": "/input", "maxDigits": 5, "timeOut": 15, "submitOnHash": True},
            "simple": {"type_": ["dtmf"], "eventApi": "/input"},
            "multi_type": {"type_": ["dtmf", "speech"], "eventApi": "/input"},
            "custom_url": {"type_": ["dtmf"], "eventApi": "/custom-input"},
            "speech": {"type_": ["speech"], "eventApi": "/speech-input", "maxDigits": 0, "timeOut": 30, "language": "en-US"}
        }

    def create_factory(self):
        """Create a VonageActionFactory instance."""
        return VonageActionFactory()

    def create_talk_action(self, config_key):
        """Create a TalkAction with specified configuration."""
        config = self.talk_action_configs[config_key]
        return TalkAction(**config)

    def create_stream_action(self, config_key):
        """Create a StreamAction with specified configuration."""
        config = self.stream_action_configs[config_key]
        return StreamAction(**config)

    def create_input_action(self, config_key):
        """Create an InputAction with specified configuration."""
        config = self.input_action_configs[config_key]
        return InputAction(**config)

    def assert_vonage_talk_action(self, vonage_action, config_key, expected_defaults=None):
        """Assert VonageTalkAction properties match configuration."""
        config = self.talk_action_configs[config_key]
        defaults = expected_defaults or {}
        
        assert isinstance(vonage_action, VonageTalkAction)
        assert vonage_action.text == config["text"]
        
        # Check explicit values or defaults
        assert vonage_action.level == config.get("volume", defaults.get("level", VonageTalkAction.default_level))
        assert vonage_action.bargeIn == config.get("bargeIn", defaults.get("bargeIn", VonageTalkAction.default_bargeIn))
        assert vonage_action.loop == config.get("loop", defaults.get("loop", VonageTalkAction.default_loop))
        assert vonage_action.language == config.get("language", defaults.get("language", VonageTalkAction.default_language))

    def assert_vonage_stream_action(self, vonage_action, config_key, expected_defaults=None):
        """Assert VonageStreamAction properties match configuration."""
        config = self.stream_action_configs[config_key]
        defaults = expected_defaults or {}
        
        assert isinstance(vonage_action, VonageStreamAction)
        assert vonage_action.streamUrl == config["url"]
        
        # Check explicit values or defaults
        assert vonage_action.level == config.get("volume", defaults.get("level", VonageStreamAction.default_level))
        assert vonage_action.bargeIn == config.get("bargeIn", defaults.get("bargeIn", VonageStreamAction.default_bargeIn))
        assert vonage_action.loop == config.get("loop", defaults.get("loop", VonageStreamAction.default_loop))

    def assert_vonage_input_action(self, vonage_action, config_key, expected_url):
        """Assert VonageInputAction properties match configuration."""
        config = self.input_action_configs[config_key]
        
        assert isinstance(vonage_action, VonageInputAction)
        assert vonage_action.type == config["type_"]
        assert vonage_action.eventUrl == expected_url
        assert vonage_action.maxDigits == config.get("maxDigits", 1)
        assert vonage_action.timeOut == config.get("timeOut", 10)
        assert vonage_action.submitOnHash == config.get("submitOnHash", False)

    def test_vonage_action_factory_inheritance(self):
        """Test that VonageActionFactory inherits from ActionFactory."""
        factory = self.create_factory()
        assert isinstance(factory, ActionFactory)

    def test_get_action_accumulator_implementation(self):
        """Test that factory returns VonageActionAccumulator."""
        accumulator = self.create_factory().get_action_accumulator_implmentation()
        assert isinstance(accumulator, VonageActionAccumulator)

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_get_action_implementation_talk_action(self):
        """Test conversion of TalkAction to VonageTalkAction."""
        base_action = self.create_talk_action("basic")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        self.assert_vonage_talk_action(vonage_action, "basic")

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_get_action_implementation_talk_action_with_defaults(self):
        """Test TalkAction conversion with default values."""
        base_action = self.create_talk_action("simple")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        self.assert_vonage_talk_action(vonage_action, "simple")

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_get_action_implementation_stream_action(self):
        """Test conversion of StreamAction to VonageStreamAction."""
        base_action = self.create_stream_action("basic")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        self.assert_vonage_stream_action(vonage_action, "basic")

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_get_action_implementation_stream_action_with_defaults(self):
        """Test StreamAction conversion with default values."""
        base_action = self.create_stream_action("simple")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        self.assert_vonage_stream_action(vonage_action, "simple")

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_get_action_implementation_input_action(self):
        """Test conversion of InputAction to VonageInputAction."""
        base_action = self.create_input_action("basic")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        self.assert_vonage_input_action(vonage_action, "basic", f"{self.test_ngrok_urls['default']}/input")

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_get_action_implementation_input_action_with_defaults(self):
        """Test InputAction conversion with default values."""
        base_action = self.create_input_action("simple")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        self.assert_vonage_input_action(vonage_action, "simple", f"{self.test_ngrok_urls['default']}/input")

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_get_action_implementation_input_action_multiple_types(self):
        """Test InputAction with multiple input types."""
        base_action = self.create_input_action("multi_type")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        assert isinstance(vonage_action, VonageInputAction)
        assert vonage_action.type == ["dtmf", "speech"]

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_get_action_implementation_unsupported_action(self):
        """Test that unsupported action types raise NotImplementedError."""
        factory = VonageActionFactory()
        
        # Create a mock action that's not supported
        class UnsupportedAction:
            pass
        
        unsupported_action = UnsupportedAction()
        
        with pytest.raises(NotImplementedError):
            factory.get_action_implmentation(unsupported_action)

    @patch.dict(os.environ, {'BASE_URL': 'https://custom.ngrok.io'})
    def test_input_action_with_custom_ngrok_url(self):
        """Test InputAction with custom NGROK URL from environment."""
        base_action = self.create_input_action("custom_url")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        self.assert_vonage_input_action(vonage_action, "custom_url", f"{self.test_ngrok_urls['custom']}/custom-input")

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_talk_action_with_all_parameters(self):
        """Test TalkAction with all possible parameters."""
        base_action = self.create_talk_action("complete")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        self.assert_vonage_talk_action(vonage_action, "complete")

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_stream_action_with_all_parameters(self):
        """Test StreamAction with all possible parameters."""
        base_action = self.create_stream_action("complete")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        self.assert_vonage_stream_action(vonage_action, "complete")

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_input_action_with_speech_configuration(self):
        """Test InputAction with speech-specific configuration."""
        base_action = self.create_input_action("speech")
        vonage_action = self.create_factory().get_action_implmentation(base_action)
        
        self.assert_vonage_input_action(vonage_action, "speech", f"{self.test_ngrok_urls['default']}/speech-input")

    def test_factory_creates_different_instances(self):
        """Test that factory creates new instances for each call."""
        factory = self.create_factory()
        
        accumulator1 = factory.get_action_accumulator_implmentation()
        accumulator2 = factory.get_action_accumulator_implmentation()
        
        assert (accumulator1 is not accumulator2 and
                isinstance(accumulator1, VonageActionAccumulator) and
                isinstance(accumulator2, VonageActionAccumulator))

    @patch.dict(os.environ, {'NGROK_URL': 'https://test.ngrok.io'})
    def test_parameter_mapping_consistency(self):
        """Test that parameter mapping is consistent across action types."""
        factory = self.create_factory()
        
        # Test volume/level mapping consistency
        talk_action = self.create_talk_action("volume_test")
        stream_action = self.create_stream_action("volume_test")
        
        vonage_talk = factory.get_action_implmentation(talk_action)
        vonage_stream = factory.get_action_implmentation(stream_action)
        
        assert (isinstance(vonage_talk, VonageTalkAction) and
                isinstance(vonage_stream, VonageStreamAction) and
                vonage_talk.level == 0.5 and vonage_stream.level == 0.5)
        
        # Test bargeIn mapping consistency
        talk_action_barge = self.create_talk_action("barge_test")
        stream_action_barge = self.create_stream_action("barge_test")
        
        vonage_talk_barge = factory.get_action_implmentation(talk_action_barge)
        vonage_stream_barge = factory.get_action_implmentation(stream_action_barge)
        
        assert (isinstance(vonage_talk_barge, VonageTalkAction) and
                isinstance(vonage_stream_barge, VonageStreamAction) and
                vonage_talk_barge.bargeIn is True and vonage_stream_barge.bargeIn is True)