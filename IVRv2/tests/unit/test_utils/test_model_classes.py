import pytest
import sys
import os
from datetime import datetime
import json

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from utils.model_classes import (
    UserAction, StreamPlaybackInfo, IVRCallStateMongoDoc, IVRfsmDoc,
    VonageCallStartResponse, StartIVRFormData, EventWebhookRequest,
    ConversationRTCWebhookRequest, DTMFDetails, DTMFInput, Option, Menu,
    BulkCallRequest
)
from utils.enums import CallStatus, ConversationRTCEventType


class TestConstants:
    """Test constants for consistent data across tests."""
    DEFAULT_PHONE = "+1234567890"
    DEFAULT_PHONE_2 = "+0987654321"
    DEFAULT_FSM_ID = "fsm_456"
    DEFAULT_CONV_ID = "conv_123"
    DEFAULT_STATE_ID = "state1"
    DEFAULT_STREAM_URL = "https://example.com/audio.mp3"
    DEFAULT_PLAY_ID = "play_123"
    DEFAULT_APP_ID = "app_123"
    DEFAULT_UUID = "call_123"


class TestHelpers:
    """Helper methods for model testing"""
    
    @staticmethod
    def assert_basic_attributes(obj, expected_attrs):
        """Assert object has expected basic attributes with correct values."""
        for attr_name, expected_value in expected_attrs.items():
            actual_value = getattr(obj, attr_name)
            assert actual_value == expected_value, f"Expected {attr_name}={expected_value}, got {actual_value}"
    
    @staticmethod
    def create_sample_options():
        """Create standard test options for menu testing."""
        return [
            Option(key=1, value="Sales"),
            Option(key=2, value="Support")
        ]


class TestUserAction:
    """Unit tests for UserAction model."""

    def test_user_action_initialization(self):
        """Test UserAction can be initialized with required parameters."""
        timestamp = datetime.now()
        action = UserAction(
            key_pressed="1",
            timestamp=timestamp,
            pre_state_id=TestConstants.DEFAULT_STATE_ID,
            post_state_id="state2"
        )
        
        TestHelpers.assert_basic_attributes(action, {
            'key_pressed': "1",
            'timestamp': timestamp,
            'pre_state_id': TestConstants.DEFAULT_STATE_ID,
            'post_state_id': "state2"
        })


class TestStreamPlaybackInfo:
    """Unit tests for StreamPlaybackInfo model."""

    def test_stream_playback_info_initialization(self):
        """Test StreamPlaybackInfo initialization with required parameters."""
        started_at = datetime.now()
        info = StreamPlaybackInfo(
            play_id=TestConstants.DEFAULT_PLAY_ID,
            stream_url=TestConstants.DEFAULT_STREAM_URL,
            started_at=started_at
        )
        
        TestHelpers.assert_basic_attributes(info, {
            'play_id': TestConstants.DEFAULT_PLAY_ID,
            'stream_url': TestConstants.DEFAULT_STREAM_URL,
            'started_at': started_at
        })
        assert info.stopped_at is None
        assert info.done_at is None


class TestIVRCallStateMongoDoc:
    """Unit tests for IVRCallStateMongoDoc model."""

    def test_ivr_call_state_initialization(self):
        """Test IVRCallStateMongoDoc initialization."""
        created_at = datetime.now()
        doc = IVRCallStateMongoDoc(
            _id=TestConstants.DEFAULT_CONV_ID,
            phone_number=TestConstants.DEFAULT_PHONE,
            fsm_id=TestConstants.DEFAULT_FSM_ID,
            current_state_id=TestConstants.DEFAULT_STATE_ID,
            created_at=created_at
        )
        
        TestHelpers.assert_basic_attributes(doc, {
            'id': TestConstants.DEFAULT_CONV_ID,
            'phone_number': TestConstants.DEFAULT_PHONE,
            'fsm_id': TestConstants.DEFAULT_FSM_ID,
            'current_state_id': TestConstants.DEFAULT_STATE_ID,
            'created_at': created_at
        })
        # Assert default values
        assert doc.stopped_at is None
        assert doc.duration == ""
        assert doc.user_actions == []
        assert doc.stream_playback == []
        assert doc.experience_data == {}
        assert doc.call_status_updates == {}


class TestIVRfsmDoc:
    """Unit tests for IVRfsmDoc model."""

    def test_ivr_fsm_doc_initialization(self):
        """Test IVRfsmDoc initialization."""
        created_at = int(datetime.now().timestamp())
        doc = IVRfsmDoc(
            _id=TestConstants.DEFAULT_FSM_ID,
            created_at=created_at,
            states=[],
            transitions=[],
            init_state_id="start"
        )
        
        TestHelpers.assert_basic_attributes(doc, {
            'id': TestConstants.DEFAULT_FSM_ID,
            'created_at': created_at,
            'states': [],
            'transitions': [],
            'init_state_id': "start"
        })


class TestVonageCallStartResponse:
    """Unit tests for VonageCallStartResponse model."""

    def test_vonage_call_start_response_initialization(self):
        """Test VonageCallStartResponse initialization."""
        response = VonageCallStartResponse(
            uuid=TestConstants.DEFAULT_UUID,
            status="started",
            direction="outbound",
            conversation_uuid=TestConstants.DEFAULT_CONV_ID
        )
        
        TestHelpers.assert_basic_attributes(response, {
            'uuid': TestConstants.DEFAULT_UUID,
            'status': "started",
            'direction': "outbound",
            'conversation_uuid': TestConstants.DEFAULT_CONV_ID
        })


class TestDTMFModels:
    """Unit tests for DTMF-related models."""

    def test_dtmf_details_initialization(self):
        """Test DTMFDetails initialization."""
        details = DTMFDetails(digits="123", timed_out=False)
        
        TestHelpers.assert_basic_attributes(details, {
            'digits': "123",
            'timed_out': False
        })

    def test_dtmf_input_initialization(self):
        """Test DTMFInput initialization."""
        dtmf_details = DTMFDetails(digits="456", timed_out=True)
        dtmf_input = DTMFInput(
            dtmf=dtmf_details,
            conversation_uuid=TestConstants.DEFAULT_CONV_ID
        )
        
        assert dtmf_input.dtmf == dtmf_details
        assert dtmf_input.conversation_uuid == TestConstants.DEFAULT_CONV_ID
        TestHelpers.assert_basic_attributes(dtmf_input.dtmf, {
            'digits': "456",
            'timed_out': True
        })


class TestMenuModels:
    """Unit tests for Menu and Option models."""

    def test_option_initialization(self):
        """Test Option initialization."""
        option = Option(key=1, value="Customer Service")
        
        TestHelpers.assert_basic_attributes(option, {
            'key': 1,
            'value': "Customer Service"
        })

    def test_menu_initialization(self):
        """Test Menu initialization."""
        options = TestHelpers.create_sample_options()
        
        menu = Menu(
            description="Main Menu",
            options=options,
            level=1
        )
        
        TestHelpers.assert_basic_attributes(menu, {
            'description': "Main Menu",
            'level': 1
        })
        assert menu.options is not None
        assert len(menu.options) == 2
        assert menu.options[0].value == "Sales"
        assert menu.options[1].value == "Support"


class TestBulkCallRequest:
    """Unit tests for BulkCallRequest model."""

    def test_bulk_call_request_initialization(self):
        """Test BulkCallRequest initialization."""
        phone_numbers = [TestConstants.DEFAULT_PHONE, TestConstants.DEFAULT_PHONE_2]
        content_ids = ["content_1", "content_2"]
        
        request = BulkCallRequest(
            phone_numbers=phone_numbers,
            content_ids=content_ids
        )
        
        TestHelpers.assert_basic_attributes(request, {
            'phone_numbers': phone_numbers,
            'content_ids': content_ids
        })
        assert len(request.phone_numbers) == 2
        assert len(request.content_ids) == 2


class TestStartIVRFormData:
    """Unit tests for StartIVRFormData model."""

    def test_start_ivr_form_data_initialization(self):
        """Test StartIVRFormData initialization."""
        form_data = StartIVRFormData(sender=TestConstants.DEFAULT_PHONE)
        
        TestHelpers.assert_basic_attributes(form_data, {
            'sender': TestConstants.DEFAULT_PHONE
        })


class TestConversationRTCWebhookRequest:
    """Unit tests for ConversationRTCWebhookRequest model."""

    def test_conversation_rtc_webhook_request_initialization(self):
        """Test ConversationRTCWebhookRequest initialization."""
        timestamp = datetime.now()
        body = {"stream_url": [TestConstants.DEFAULT_STREAM_URL], "play_id": TestConstants.DEFAULT_PLAY_ID}
        
        request = ConversationRTCWebhookRequest(
            body=body,
            application_id=TestConstants.DEFAULT_APP_ID,
            timestamp=timestamp,
            type=ConversationRTCEventType.AUDIO_PLAY,
            conversation_id=TestConstants.DEFAULT_CONV_ID
        )
        
        TestHelpers.assert_basic_attributes(request, {
            'body': body,
            'application_id': TestConstants.DEFAULT_APP_ID,
            'timestamp': timestamp,
            'type': ConversationRTCEventType.AUDIO_PLAY,
            'conversation_id': TestConstants.DEFAULT_CONV_ID
        })