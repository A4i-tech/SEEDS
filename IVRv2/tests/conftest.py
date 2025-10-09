import pytest
import asyncio
import os
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from typing import Dict, Any, Optional

# Add the parent directory to the path for imports
import sys
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fsm.fsm import FSM
from fsm.state import State
from fsm.transition import Transition
from actions.base_actions.talk_action import TalkAction
from actions.base_actions.stream_action import StreamAction
from actions.base_actions.input_action import InputAction
from actions.vonage_actions.vonage_action_factory import VonageActionFactory
from utils.model_classes import IVRCallStateMongoDoc, IVRfsmDoc


@pytest.fixture(scope="session")
def event_loop():
    """Create an instance of the default event loop for the test session."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest.fixture
def sample_fsm():
    """Create a sample FSM for testing."""
    fsm = FSM(fsm_id="test_fsm")
    
    # Create states
    input_action = InputAction(type_=["dtmf"], eventApi="http://test.com/input")
    
    state1 = State(
        state_id="1", 
        actions=[
            TalkAction(text="Welcome to the test IVR"),
            TalkAction(text="Press 1 for option A, press 2 for option B"),
            input_action
        ]
    )
    
    state2 = State(
        state_id="2", 
        actions=[
            TalkAction(text="You selected option A"),
            input_action
        ]
    )
    
    state3 = State(
        state_id="3", 
        actions=[
            TalkAction(text="You selected option B"),
            input_action
        ]
    )
    
    state4 = State(
        state_id="4", 
        actions=[TalkAction(text="Thank you for calling")]
    )
    
    # Add states to FSM
    fsm.add_state(state1)
    fsm.add_state(state2)
    fsm.add_state(state3)
    fsm.add_state(state4)
    
    # Set initial state
    fsm.set_init_state_id("1")
    
    # Add transitions
    fsm.add_transition(Transition(source_state_id="1", dest_state_id="2", input="1", actions=[]))
    fsm.add_transition(Transition(source_state_id="1", dest_state_id="3", input="2", actions=[]))
    fsm.add_transition(Transition(source_state_id="2", dest_state_id="4", input="0", actions=[]))
    fsm.add_transition(Transition(source_state_id="3", dest_state_id="4", input="0", actions=[]))
    fsm.add_transition(Transition(source_state_id="2", dest_state_id="1", input="9", actions=[]))
    fsm.add_transition(Transition(source_state_id="3", dest_state_id="1", input="9", actions=[]))
    
    return fsm


@pytest.fixture
def sample_ivr_state():
    """Create a sample IVR call state for testing."""
    return IVRCallStateMongoDoc(
        _id="test_conv_uuid",
        phone_number="+1234567890",
        fsm_id="test_fsm",
        current_state_id="1",
        created_at=datetime.now()
    )


@pytest.fixture
def vonage_action_factory():
    """Create a Vonage action factory for testing."""
    return VonageActionFactory()


@pytest.fixture
def test_environment_vars():
    """Set up test environment variables."""
    test_vars = {
        'VONAGE_APPLICATION_ID': 'test_app_id',
        'VONAGE_PRIVATE_KEY_PATH': 'test_key_path',
        'VONAGE_NUMBER': '+1234567890',
        'NGROK_URL': 'http://test.ngrok.io',
        'CALL_DURATION_LIMIT': '1800',
        'STALE_WAIT_IN_SECONDS': '60',
        'BLOB_STORE_CONN_STR': 'test_blob_connection'
    }
    
    with patch.dict(os.environ, test_vars):
        yield test_vars


class TestDataFactory:
    """Factory class for creating test data."""
    
    @staticmethod
    def create_event_webhook_data(
        conversation_uuid: str = "test_conv_uuid",
        status: str = "answered",
        uuid: str = "test_call_uuid"
    ) -> Dict[str, Any]:
        """Create test data for event webhook."""
        return {
            "uuid": uuid,
            "conversation_uuid": conversation_uuid,
            "status": status,
            "direction": "outbound",
            "from": "+1234567890",
            "to": "+0987654321",
            "timestamp": "2023-01-01T12:00:00Z"
        }
    
    @staticmethod
    def create_dtmf_input_data(
        conversation_uuid: str = "test_conv_uuid",
        digits: str = "1"
    ) -> Dict[str, Any]:
        """Create test data for DTMF input."""
        return {
            "conversation_uuid": conversation_uuid,
            "dtmf": {
                "digits": digits,
                "timed_out": False
            },
            "timestamp": "2023-01-01T12:00:00Z"
        }
    
    @staticmethod
    def create_conversation_rtc_data(
        conversation_id: str = "test_conv_uuid",
        event_type: str = "audio:play",
        body: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Create test data for conversation RTC events."""
        if body is None:
            body = {
                "stream_url": ["https://test.com/audio.mp3"],
                "play_id": "test_play_id"
            }
        
        return {
            "conversation_id": conversation_id,
            "type": event_type,
            "body": body,
            "timestamp": datetime.now()
        }


def create_mock_fsm_doc(fsm_id: str = "test_fsm") -> IVRfsmDoc:
    """Create a mock FSM document."""
    return IVRfsmDoc(
        _id=fsm_id,
        created_at=int(datetime.now().timestamp()),
        states=[],
        transitions=[],
        init_state_id="1"
    )