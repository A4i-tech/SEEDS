import pytest
import sys
import os

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from app.base_classes.action_factory import ActionFactory
from app.base_classes.action import Action
from app.base_classes.action_accumulator import ActionAccumulator
from app.actions.base_actions.talk_action import TalkAction
from app.actions.base_actions.stream_action import StreamAction


class TestConcreteActionFactory(ActionFactory):
    """Concrete implementation of ActionFactory for testing purposes."""
    
    def get_action_implmentation(self, action: Action):
        """Simple implementation that returns a dictionary representation."""
        if isinstance(action, TalkAction):
            return {"type": "talk", "text": action.text}
        elif isinstance(action, StreamAction):
            return {"type": "stream", "url": action.url}
        else:
            return {"type": "unknown", "data": str(action)}
    
    def get_action_accumulator_implmentation(self):
        """Returns a mock accumulator implementation."""
        class MockAccumulator(ActionAccumulator):
            def combine(self, actions: list[Action]):
                return [f"combined:{len(actions)}"]
        
        return MockAccumulator()


class TestActionFactory:
    """Unit tests for ActionFactory abstract base class."""

    @property
    def test_data(self):
        return {
            "texts": {"hello": "Hello", "first": "First", "second": "Second", "test": "Test"},
            "urls": {"basic": "https://example.com/audio.mp3", "first": "https://example.com/first.mp3", "second": "https://example.com/second.mp3", "test": "test.mp3"},
            "expected": {"talk_hello": {"type": "talk", "text": "Hello"}, "stream_basic": {"type": "stream", "url": "https://example.com/audio.mp3"}, "unknown_custom": {"type": "unknown", "data": "CustomAction"}}
        }

    # Ultra-compact helper methods for maximum line reduction
    def factory(self): return TestConcreteActionFactory()
    def talk(self, key): return TalkAction(text=self.test_data["texts"][key])
    def stream(self, key): return StreamAction(url=self.test_data["urls"][key])
    def custom_action(self): 
        class CustomAction(Action):
            def get(self, sas_gen_obj): return "custom"
            def __str__(self): return "CustomAction"
        return CustomAction()

    def test_action_factory_is_abstract(self):
        """Test that ActionFactory cannot be instantiated directly."""
        with pytest.raises(TypeError): ActionFactory()

    def test_concrete_action_factory_implementation(self):
        """Test concrete implementation of ActionFactory."""
        result = self.factory().get_action_implmentation(self.talk("hello"))
        assert isinstance(result, dict) and result == self.test_data["expected"]["talk_hello"]

    def test_action_factory_with_stream_action(self):
        """Test ActionFactory with StreamAction."""
        result = self.factory().get_action_implmentation(self.stream("basic"))
        assert result == self.test_data["expected"]["stream_basic"]

    def test_action_factory_with_unknown_action(self):
        """Test ActionFactory with unknown action type."""
        result = self.factory().get_action_implmentation(self.custom_action())
        assert result == self.test_data["expected"]["unknown_custom"]

    def test_action_factory_get_accumulator_implementation(self):
        """Test ActionFactory accumulator implementation."""
        accumulator = self.factory().get_action_accumulator_implmentation()
        assert isinstance(accumulator, ActionAccumulator) and hasattr(accumulator, 'combine') and callable(accumulator.combine)

    def test_action_factory_accumulator_functionality(self):
        """Test that returned accumulator works correctly."""
        result = self.factory().get_action_accumulator_implmentation().combine([self.talk("test"), self.stream("test")])
        assert result == ["combined:2"]

    def test_action_factory_method_signatures(self):
        """Test that factory methods have correct signatures."""
        f = self.factory()
        assert f.get_action_implmentation(self.talk("test")) is not None and f.get_action_accumulator_implmentation() is not None

    def test_action_factory_inheritance(self):
        """Test that TestConcreteActionFactory properly inherits from ActionFactory."""
        f = self.factory()
        assert (isinstance(f, ActionFactory) and hasattr(f, 'get_action_implmentation') and 
                hasattr(f, 'get_action_accumulator_implmentation') and callable(f.get_action_implmentation) and 
                callable(f.get_action_accumulator_implmentation))

    def test_action_factory_with_multiple_actions(self):
        """Test ActionFactory with multiple different actions."""
        f = self.factory()
        actions = [self.talk("first"), self.stream("first"), self.talk("second"), self.stream("second")]
        results = [f.get_action_implmentation(a) for a in actions]
        assert (len(results) == 4 and results[0]["type"] == "talk" and results[0]["text"] == "First" and
                results[1]["type"] == "stream" and "first.mp3" in results[1]["url"] and
                results[2]["type"] == "talk" and results[2]["text"] == "Second" and
                results[3]["type"] == "stream" and "second.mp3" in results[3]["url"])

    def test_action_factory_with_none_action(self):
        """Test ActionFactory behavior with None action."""
        # Factory should handle None gracefully or raise expected exceptions
        try: 
            result = self.factory().get_action_implmentation(None)
            assert result["type"] == "unknown"
        except (TypeError, AttributeError): 
            pass  # Expected behavior