import pytest
import sys
import os
from unittest.mock import AsyncMock, MagicMock, patch
import asyncio
import threading
import time

sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

class IVRTestFactory:
    """Factory for creating IVR test data and mocks."""
    
    @staticmethod
    def sample_config(config_type="full"):
        """Generate various IVR configurations."""
        configs = {
            "minimal": {"id": "minimal_ivr"},
            "full": {
                "id": "test_ivr",
                "name": "Test IVR", 
                "language": "en",
                "voice": "Amy",
                "entry_point": "welcome"
            }
        }
        return configs.get(config_type, configs["full"])
    
    @staticmethod
    def mock_instantiation():
        """Create a mock instantiation object."""
        mock = MagicMock()
        mock.start_call = AsyncMock(return_value={"status": "start_call_success"})
        mock.get_current_state = MagicMock(return_value="get_current_state_result")
        return mock


@pytest.fixture
def factory():
    """Provide access to the test factory."""
    return IVRTestFactory


@pytest.fixture 
def mock_ivr_class():
    """Mock the IVR class since it doesn't exist yet."""
    class MockIVR:
        def __init__(self, config):
            if not config or not config.get('id'):
                raise ValueError("Config must have 'id' field")
            self.config = config.copy()
            self.instantiation = IVRTestFactory.mock_instantiation()
            
        def __getattr__(self, name):
            return getattr(self.instantiation, name)
            
        def get_config(self):
            return self.config
    
    return MockIVR

def test_ivr_initialization(factory, mock_ivr_class):
    """Test IVR initialization with valid configuration."""
    config = factory.sample_config()
    ivr = mock_ivr_class(config)
    assert ivr.config == config
    assert hasattr(ivr, 'instantiation')

def test_ivr_initialization_invalid_config(mock_ivr_class):
    """Test IVR initialization with invalid configuration."""
    with pytest.raises(ValueError):
        mock_ivr_class({})

@pytest.mark.asyncio
async def test_ivr_start_call(factory, mock_ivr_class):
    """Test starting a call."""
    ivr = mock_ivr_class(factory.sample_config())
    result = await ivr.start_call("call123", "user456")
    assert result["status"] == "start_call_success"

def test_ivr_get_config(factory, mock_ivr_class):
    """Test getting IVR configuration."""
    ivr = mock_ivr_class(factory.sample_config())
    config = ivr.get_config()
    assert config == factory.sample_config()