import pytest
import sys
import os
from unittest.mock import patch

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from app.comprehension_model_classes import *
from app.fsm.fsm import FSM
from app.actions.base_actions.stream_action import StreamAction
from app.actions.base_actions.input_action import InputAction


class TestDataFactory:
    """Factory class for creating test data with parametrized generation."""
    
    @staticmethod
    def url_entity(name="test", text="Test text"):
        return URLTextEntity(url=f"https://example.com/{name}.mp3", text=text)
    
    @staticmethod
    def option(index=0):
        return ComprehensionOption(
            exploreOption=TestDataFactory.url_entity(f"explore{index}", f"Explore {index}"),
            exploreValue=TestDataFactory.url_entity(f"value{index}", f"Value {index}")
        )
    
    @staticmethod
    def sub_comprehension(index=0, num_options=1):
        return SubComprehension(
            passage=TestDataFactory.url_entity(f"passage{index}", f"Passage {index}"),
            options=[TestDataFactory.option(i) for i in range(num_options)]
        )
    
    @staticmethod
    def comprehension_data(num_stages=1):
        return ComprehensionData(
            intro=TestDataFactory.url_entity("intro", "Welcome"),
            conclusion=TestDataFactory.url_entity("conclusion", "The End"),
            data=[TestDataFactory.sub_comprehension(i) for i in range(num_stages)]
        )


@pytest.fixture
def factory():
    """Provides access to the test data factory."""
    return TestDataFactory


@pytest.mark.parametrize("model_class,factory_method,expected_attrs", [
    (URLTextEntity, "url_entity", ["url", "text"]),
    (ComprehensionOption, "option", ["exploreOption", "exploreValue"]),
    (SubComprehension, "sub_comprehension", ["passage", "options"]),
    (ComprehensionData, "comprehension_data", ["intro", "conclusion", "data"])
])
def test_model_initialization_and_serialization(factory, model_class, factory_method, expected_attrs):
    """Test model initialization and serialization for all model classes."""
    instance = getattr(factory, factory_method)()
    
    # Test basic attributes exist
    for attr in expected_attrs:
        assert hasattr(instance, attr)
    
    # Test serialization works
    data = instance.dict()
    assert isinstance(data, dict)
    assert all(attr in data for attr in expected_attrs)


@pytest.mark.parametrize("num_options,expected_count", [(1, 1), (3, 3), (5, 5)])
def test_sub_comprehension_multiple_options(factory, num_options, expected_count):
    """Test SubComprehension with varying numbers of options."""
    sub_comp = factory.sub_comprehension(0, num_options)
    assert len(sub_comp.options) == expected_count
    if expected_count > 1:
        assert sub_comp.options[1].exploreOption.text == "Explore 1"


@pytest.mark.parametrize("num_stages", [0, 1, 3, 5])
def test_comprehension_data_multiple_stages(factory, num_stages):
    """Test ComprehensionData with varying numbers of stages."""
    comp_data = factory.comprehension_data(num_stages)
    assert len(comp_data.data) == num_stages
    if num_stages > 1:
        assert comp_data.data[1].passage.text == "Passage 1"


class TestComprehension:
    """Comprehensive tests for Comprehension class using factory patterns."""
    
    def test_initialization(self, factory):
        """Test Comprehension initialization."""
        comp_data = factory.comprehension_data()
        comprehension = Comprehension(comp_data)
        
        assert comprehension.comprehension_data == comp_data
        assert isinstance(comprehension.input_action, InputAction)

    @pytest.mark.parametrize("state_type,method_name,min_actions", [
        ("initial", "get_initial_state", 2),
        ("end", "get_end_state", 1)
    ])
    def test_state_generation_methods(self, factory, state_type, method_name, min_actions):
        """Test various state generation methods."""
        comprehension = Comprehension(factory.comprehension_data())
        
        if state_type == "initial":
            state = getattr(comprehension, method_name)("test_state")
        else:
            state = getattr(comprehension, method_name)()
            
        assert isinstance(state, State)
        assert len(state.actions) >= min_actions

    @pytest.mark.parametrize("num_stages,expected_min_states", [(0, 2), (1, 3), (3, 5)])
    def test_fsm_generation(self, factory, num_stages, expected_min_states):
        """Test FSM generation with different numbers of stages."""
        comprehension = Comprehension(factory.comprehension_data(num_stages))
        fsm = FSM(f"test_fsm_{num_stages}")
        
        comprehension.generate_states(fsm, f"test_{num_stages}")
        assert len(fsm.states) >= expected_min_states

    def test_sub_comprehension_states(self, factory):
        """Test sub-comprehension state generation."""
        comprehension = Comprehension(factory.comprehension_data())
        fsm = FSM("sub_test")
        sub_comp = factory.sub_comprehension(0, 2)  # 2 options
        
        state_ids = comprehension.generate_sub_comprehension_states(fsm, sub_comp, 0)
        
        assert isinstance(state_ids, dict)
        assert {"question", "options"} <= state_ids.keys()
        assert len(state_ids["options"]) == 2

    @patch('app.comprehension_model_classes.print')  # Suppress print statements during testing
    def test_integration(self, mock_print, factory):
        """Test full integration with realistic data."""
        comp_data = factory.comprehension_data(2)  # 2 stages
        comprehension = Comprehension(comp_data)
        fsm = FSM("integration_test")
        
        # Should complete without errors
        comprehension.generate_states(fsm, "integration")
        
        # Verify FSM structure
        assert len(fsm.states) > 0
        assert fsm.init_state_id is not None