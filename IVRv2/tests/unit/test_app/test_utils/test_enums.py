import pytest
import sys
import os
from enum import Enum

# Add the parent directory to the path for imports
sys.path.append(os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))))

from app.utils.enums import ConversationRTCEventType, CallStatus


class TestConversationRTCEventType:
    """Unit tests for ConversationRTCEventType enum."""

    def test_conversation_rtc_event_type_is_enum(self):
        """Test that ConversationRTCEventType is an Enum."""
        assert issubclass(ConversationRTCEventType, Enum)

    def test_conversation_rtc_event_type_general_value(self):
        """Test ConversationRTCEventType.GENERAL value."""
        assert ConversationRTCEventType.GENERAL.value == "leg:status:update"

    def test_conversation_rtc_event_type_audio_dtmf_value(self):
        """Test ConversationRTCEventType.AUDIO_DTMF value."""
        assert ConversationRTCEventType.AUDIO_DTMF.value == "audio:dtmf"

    def test_conversation_rtc_event_type_rtc_status_value(self):
        """Test ConversationRTCEventType.RTC_STATUS value."""
        assert ConversationRTCEventType.RTC_STATUS.value == "rtc:status"

    def test_conversation_rtc_event_type_by_value(self):
        """Test accessing ConversationRTCEventType by value."""
        event = ConversationRTCEventType("leg:status:update")
        assert event == ConversationRTCEventType.GENERAL

    def test_conversation_rtc_event_type_members(self):
        """Test that ConversationRTCEventType has expected members."""
        members = list(ConversationRTCEventType)
        assert ConversationRTCEventType.GENERAL in members
        assert len(members) > 40  # Should have many members


class TestCallStatus:
    """Unit tests for CallStatus enum."""

    def test_call_status_is_enum(self):
        """Test that CallStatus is an Enum."""
        assert issubclass(CallStatus, Enum)

    def test_call_status_started_value(self):
        """Test CallStatus.STARTED value."""
        assert CallStatus.STARTED.value == "started"

    def test_call_status_get_end_call_enums(self):
        """Test CallStatus.get_end_call_enums static method."""
        end_call_enums = CallStatus.get_end_call_enums()
        
        assert isinstance(end_call_enums, list)
        assert CallStatus.BUSY in end_call_enums
        assert CallStatus.COMPLETED in end_call_enums
        assert CallStatus.STARTED not in end_call_enums