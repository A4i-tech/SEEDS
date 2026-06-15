import pytest
import asyncio
from unittest.mock import AsyncMock, Mock, patch, MagicMock
import sys
import os
import types

# Set environment variables before any imports that might need them
os.environ['STORAGE_ACCOUNT_NAME'] = 'test'
os.environ['ENVIRONMENT'] = 'development'  # Force development mode to avoid Azure App Insights
os.environ['APPLICATIONINSIGHTS_CONNECTION_STRING'] = 'InstrumentationKey=test-key;IngestionEndpoint=https://test.com/'

sys.path.append(os.path.dirname(os.path.abspath(__file__)) + "/../")

# Mock the singletons module to avoid Settings() validation errors during DTMFInputEvent import
_mock_ws_service = types.ModuleType('app.services.singletons.websocket_service')
_mock_ws_service.WebsocketService = MagicMock()
sys.modules['app.services.singletons.websocket_service'] = _mock_ws_service

_mock_conf_manager = types.ModuleType('app.services.singletons.conference_call_manager')
_mock_conf_manager.conference_manager = MagicMock()
sys.modules['app.services.singletons.conference_call_manager'] = _mock_conf_manager

from app.services.conference_call import ConferenceCall
from app.models.conference_call_state import ConferenceCallState
from app.models.participant import Role, CallStatus
from app.models.system_audio_messages import SystemAudioMessages
from app.models.action_history import ActionType
from app.services.confevents.base_event import ConferenceEvent
from app.services.confevents.dtmf_input_event import DTMFInputEvent
from app.models.audio_content_state import ContentStatus


class MockEvent(ConferenceEvent):
    """Mock event for testing"""
    def __init__(self, should_raise_exception=False, should_timeout=False):
        self.executed = False
        self.should_raise_exception = should_raise_exception
        self.should_timeout = should_timeout
    
    async def execute_event(self):
        if self.should_timeout:
            await asyncio.sleep(60)
        if self.should_raise_exception:
            raise Exception("Test exception")
        self.executed = True


@pytest.fixture
def mock_services():
    """Consolidated fixture for all mocked services"""
    communication_api = AsyncMock()
    communication_api.start_conf = AsyncMock()
    communication_api.get_is_websocket_connected = Mock(return_value=True)
    communication_api.reconnect_websocket = AsyncMock()
    
    storage_manager = AsyncMock()
    storage_manager.save_state = AsyncMock()
    
    connection_manager = AsyncMock()
    connection_manager.connect = AsyncMock(return_value={"status": "connected"})
    connection_manager.disconnect = AsyncMock(return_value={"status": "disconnected"})
    connection_manager.send_message_to_client = AsyncMock()
    
    return communication_api, storage_manager, connection_manager


@pytest.fixture
def conference_call(mock_services):
    """Conference call instance with mocked dependencies"""
    communication_api, storage_manager, connection_manager = mock_services
    return ConferenceCall(
        conf_id="test-conf-123",
        communication_api=communication_api,
        storage_manager=storage_manager,
        connection_manager=connection_manager
    ), communication_api, storage_manager, connection_manager


@pytest.fixture
def participants():
    """Sample participant data"""
    return "+1234567890", ["+1111111111", "+2222222222"]


class TestConferenceCall:
    
    def test_init(self, conference_call):
        """Test ConferenceCall initialization"""
        conf_call, _, _, _ = conference_call
        assert conf_call.conf_id == "test-conf-123"
        assert isinstance(conf_call.state, ConferenceCallState)
        assert isinstance(conf_call.event_queue, asyncio.Queue)
        assert conf_call.event_queue_processing_task is None
    
    def test_set_participant_state(self, conference_call, participants):
        """Test setting participant state"""
        conf_call, _, _, _ = conference_call
        teacher_phone, student_phones = participants
        
        conf_call.set_participant_state(teacher_phone, student_phones)
        
        # Verify teacher and students setup
        assert conf_call.state.teacher_phone_number == teacher_phone
        assert conf_call.state.participants[teacher_phone].role == Role.TEACHER
        assert all(conf_call.state.participants[phone].role == Role.STUDENT 
                  for phone in student_phones)
        assert all(p.call_status == CallStatus.DISCONNECTED 
                  for p in conf_call.state.participants.values())
    
    @pytest.mark.asyncio
    async def test_start_conference(self, conference_call, participants):
        """Test starting a conference"""
        conf_call, comm_api, _, _ = conference_call
        teacher_phone, student_phones = participants
        
        conf_call.set_participant_state(teacher_phone, student_phones)
        
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock) as mock_update:
            await conf_call.start_conference()
            
            comm_api.start_conf.assert_called_once_with(teacher_phone, student_phones)
            assert conf_call.state.is_running is True
            assert len(conf_call.state.action_history) == 1
            assert conf_call.state.action_history[0].action_type == ActionType.CONFERENCE_START
            mock_update.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_smartphone_connection(self, conference_call, participants):
        """Test smartphone connect/disconnect functionality"""
        conf_call, _, _, conn_mgr = conference_call
        teacher_phone, _ = participants
        
        # Test successful connection
        conf_call.set_participant_state(teacher_phone, [])
        result = await conf_call.connect_smartphone()
        teacher = conf_call.state.get_teacher()
        conn_mgr.connect.assert_called_once_with(client=teacher)
        assert result["status"] == "connected"
        
        # Test successful disconnection
        result = await conf_call.disconnect_smartphone()
        conn_mgr.disconnect.assert_called_once_with(client=teacher)
        assert result["status"] == "disconnected"
    
    @pytest.mark.asyncio
    async def test_mute_event_failure_keeps_state_and_resyncs(self, conference_call, participants):
        """A failed Vonage mute must not flip is_muted, but must still push state"""
        from app.services.confevents.mute_participant_event import MuteParticipantEvent

        conf_call, comm_api, _, conn_mgr = conference_call
        teacher_phone, student_phones = participants
        conf_call.set_participant_state(teacher_phone, student_phones)
        student_phone = student_phones[0]
        conf_call.state.participants[student_phone].is_muted = False

        comm_api.mute_participant.side_effect = asyncio.TimeoutError()

        event = MuteParticipantEvent(phone_number=student_phone, conf_call=conf_call)
        result = await event.execute_event()

        assert result is False
        assert conf_call.state.participants[student_phone].is_muted is False
        conn_mgr.send_message_to_client.assert_called_once()

    @pytest.mark.asyncio
    async def test_unmute_event_failure_keeps_state_and_resyncs(self, conference_call, participants):
        """A failed Vonage unmute must not flip is_muted, but must still push state"""
        from app.services.confevents.unmute_participant_event import UnmuteParticipantEvent

        conf_call, comm_api, _, conn_mgr = conference_call
        teacher_phone, student_phones = participants
        conf_call.set_participant_state(teacher_phone, student_phones)
        student_phone = student_phones[0]

        comm_api.unmute_participant.side_effect = Exception("400 stale leg")

        event = UnmuteParticipantEvent(phone_number=student_phone, conf_call=conf_call)
        result = await event.execute_event()

        assert result is False
        assert conf_call.state.participants[student_phone].is_muted is True
        conn_mgr.send_message_to_client.assert_called_once()

    @pytest.mark.asyncio
    async def test_mute_event_unknown_participant_logs_and_resyncs(self, conference_call, participants):
        """Mute for an unknown phone number must not be a silent no-op"""
        from app.services.confevents.mute_participant_event import MuteParticipantEvent

        conf_call, comm_api, _, conn_mgr = conference_call
        teacher_phone, student_phones = participants
        conf_call.set_participant_state(teacher_phone, student_phones)

        event = MuteParticipantEvent(phone_number="919999999999", conf_call=conf_call)
        await event.execute_event()

        comm_api.mute_participant.assert_not_called()
        conn_mgr.send_message_to_client.assert_called_once()

    @pytest.mark.asyncio
    async def test_smartphone_connection_no_teacher(self, conference_call):
        """Test smartphone operations when no teacher exists"""
        conf_call, _, _, _ = conference_call
        
        with pytest.raises(ValueError, match="No teacher participant"):
            await conf_call.connect_smartphone()
        
        with pytest.raises(ValueError, match="No teacher participant"):
            await conf_call.disconnect_smartphone()
    
    @pytest.mark.asyncio
    async def test_update_state(self, conference_call, participants):
        """Test state update functionality"""
        conf_call, _, storage_mgr, conn_mgr = conference_call
        teacher_phone, _ = participants
        conf_call.set_participant_state(teacher_phone, [])
        
        await conf_call.update_state()
        
        storage_mgr.save_state.assert_called_once()
        conn_mgr.send_message_to_client.assert_called_once()
        
        # Verify correct arguments
        save_args = storage_mgr.save_state.call_args[0]
        assert save_args[0] == "test-conf-123"
        assert isinstance(save_args[1], dict)
    
    @pytest.mark.asyncio
    @pytest.mark.parametrize("is_running,websocket_connected,should_stream", [
        (True, True, True),
        (True, False, False),
        (False, True, False),
        (False, False, False)
    ])
    async def test_stream_system_message(self, conference_call, is_running, websocket_connected, should_stream):
        """Test system message streaming under different conditions"""
        conf_call, comm_api, _, _ = conference_call
        conf_call.state.is_running = is_running
        comm_api.get_is_websocket_connected.return_value = websocket_connected
        
        with patch.object(conf_call._system_message_streaming_service, 'stream_message', 
                         new_callable=AsyncMock) as mock_stream:
            await conf_call.stream_system_message(SystemAudioMessages.TEACHER_HAS_JOINED)
            
            if should_stream:
                mock_stream.assert_called_once_with(SystemAudioMessages.TEACHER_HAS_JOINED)
            else:
                mock_stream.assert_not_called()
    
    @pytest.mark.asyncio
    async def test_queue_event(self, conference_call):
        """Test queuing an event"""
        conf_call, _, _, _ = conference_call
        event = MockEvent()
        
        await conf_call.queue_event(event)
        assert conf_call.event_queue.qsize() == 1
        assert await conf_call.event_queue.get() == event
    
    @pytest.mark.asyncio
    async def test_event_queue_processing_lifecycle(self, conference_call):
        """Test starting/stopping event queue processing"""
        conf_call, _, _, _ = conference_call
        
        # Test starting
        conf_call.start_processing_conf_events_from_queue()
        assert conf_call.event_queue_processing_task is not None
        assert not conf_call.event_queue_processing_task.cancelled()
        
        # Test stopping
        task = conf_call.event_queue_processing_task
        await asyncio.sleep(0.01)  # Allow task to start
        conf_call.end_processing_conf_events_from_queue()
        await asyncio.sleep(0.01)  # Allow cancellation
        assert task.cancelled()
        
        # Test stopping when no task exists
        conf_call.event_queue_processing_task = None
        conf_call.end_processing_conf_events_from_queue()  # Should not raise
    
    @pytest.mark.asyncio
    async def test_on_websocket_disconnect_callback(self, conference_call):
        """Test websocket disconnect callback"""
        conf_call, comm_api, _, _ = conference_call
        await conf_call.on_websocket_disconnect_callback()
        comm_api.reconnect_websocket.assert_called_once()
    
    @pytest.mark.asyncio
    @pytest.mark.parametrize("event_type,expected_executed,should_log", [
        ("normal", True, False),
        ("exception", False, True),
        ("timeout", False, True)
    ])
    async def test_event_processing_scenarios(self, conference_call, event_type, expected_executed, should_log):
        """Test various event processing scenarios"""
        conf_call, _, _, _ = conference_call
        
        event_kwargs = {
            "normal": {},
            "exception": {"should_raise_exception": True},
            "timeout": {"should_timeout": True}
        }
        event = MockEvent(**event_kwargs[event_type])
        await conf_call.event_queue.put(event)
        
        with patch('app.services.conference_call.logger_instance') as mock_logger:
            # For timeout test, use a short timeout to make the test run fast
            if event_type == "timeout":
                conf_call.event_queue_processing_task = asyncio.create_task(
                    conf_call._ConferenceCall__process_conf_events_queue(timeout=1.0)
                )
                wait_time = 1.5
            else:
                conf_call.start_processing_conf_events_from_queue()
                wait_time = 0.1

            await asyncio.sleep(wait_time)
            
            conf_call.end_processing_conf_events_from_queue()
            
            assert event.executed == expected_executed
            if should_log:
                assert mock_logger.error.called or mock_logger.info.called
    
    @pytest.mark.asyncio
    async def test_multiple_events_processing(self, conference_call):
        """Test processing multiple events from queue"""
        conf_call, _, _, _ = conference_call
        events = [MockEvent() for _ in range(3)]
        
        for event in events:
            await conf_call.event_queue.put(event)
        
        conf_call.start_processing_conf_events_from_queue()
        await asyncio.sleep(0.2)
        conf_call.end_processing_conf_events_from_queue()
        
        assert all(event.executed for event in events)
    
    @pytest.mark.asyncio
    async def test_restart_processing_cancels_previous_task(self, conference_call):
        """Test that restarting processing cancels the previous task"""
        conf_call, _, _, _ = conference_call
        
        conf_call.start_processing_conf_events_from_queue()
        first_task = conf_call.event_queue_processing_task
        await asyncio.sleep(0.01)
        
        conf_call.start_processing_conf_events_from_queue()
        second_task = conf_call.event_queue_processing_task
        await asyncio.sleep(0.01)
        
        assert first_task.cancelled()
        assert second_task != first_task
        assert not second_task.cancelled()
        
        conf_call.end_processing_conf_events_from_queue()


class TestConferenceCallIntegration:
    """Integration tests for ConferenceCall"""
    
    @pytest.mark.asyncio
    async def test_complete_conference_workflow(self, mock_services, participants):
        """Test complete conference workflow from start to finish"""
        communication_api, storage_manager, connection_manager = mock_services
        conference_call = ConferenceCall(
            conf_id="integration-test-conf",
            communication_api=communication_api,
            storage_manager=storage_manager,
            connection_manager=connection_manager
        )
        
        teacher_phone, student_phones = participants
        
        # Complete workflow
        conference_call.set_participant_state(teacher_phone, student_phones)
        
        connect_result = await conference_call.connect_smartphone()
        assert connect_result is not None
        assert connect_result["status"] == "connected"
        
        await conference_call.start_conference()
        assert conference_call.state.is_running is True
        
        # Test system message streaming with mock
        with patch.object(conference_call._system_message_streaming_service, 'stream_message', 
                         new_callable=AsyncMock) as mock_stream:
            await conference_call.stream_system_message(SystemAudioMessages.TEACHER_HAS_JOINED)
            mock_stream.assert_called_once_with(SystemAudioMessages.TEACHER_HAS_JOINED)
        
        # Test event processing
        event = MockEvent()
        await conference_call.queue_event(event)
        conference_call.start_processing_conf_events_from_queue()
        await asyncio.sleep(0.1)
        conference_call.end_processing_conf_events_from_queue()
        assert event.executed is True
        
        disconnect_result = await conference_call.disconnect_smartphone()
        assert disconnect_result is not None
        assert disconnect_result["status"] == "disconnected"
        
        # Verify all services were called
        communication_api.start_conf.assert_called_once()
        storage_manager.save_state.assert_called()
        connection_manager.connect.assert_called_once()
        connection_manager.disconnect.assert_called_once()


class TestLeaderDTMF:
    """Tests for leader DTMF input handling"""

    @pytest.fixture
    def dtmf_conf_call(self, mock_services):
        """Conference call configured with a leader for DTMF tests"""
        communication_api, storage_manager, connection_manager = mock_services
        conf_call = ConferenceCall(
            conf_id="dtmf-test-conf",
            communication_api=communication_api,
            storage_manager=storage_manager,
            connection_manager=connection_manager
        )
        teacher_phone = "91000000001"
        student_phones = ["91000000002", "91000000003"]
        leader_phone = "91000000002"
        conf_call.set_participant_state(teacher_phone, student_phones, leader_phone)
        return conf_call

    @pytest.mark.asyncio
    async def test_leader_mute_all_via_dtmf(self, dtmf_conf_call):
        """Leader pressing '1' should trigger MuteAllEvent."""
        conf_call = dtmf_conf_call
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock):
            event = DTMFInputEvent(phone_number="91000000002", digit="1", conf_call=conf_call)
            with patch('app.services.confevents.dtmf_input_event.MuteAllEvent') as MockMute:
                mock_instance = AsyncMock()
                MockMute.return_value = mock_instance
                await event.execute_event()
                MockMute.assert_called_once_with(conf_call=conf_call, initiator_phone="91000000002")
                mock_instance.execute_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_leader_unmute_all_via_dtmf(self, dtmf_conf_call):
        """Leader pressing '3' should trigger UnmuteAllEvent."""
        conf_call = dtmf_conf_call
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock):
            event = DTMFInputEvent(phone_number="91000000002", digit="3", conf_call=conf_call)
            with patch('app.services.confevents.dtmf_input_event.UnmuteAllEvent') as MockUnmute:
                mock_instance = AsyncMock()
                MockUnmute.return_value = mock_instance
                await event.execute_event()
                MockUnmute.assert_called_once_with(conf_call=conf_call, initiator_phone="91000000002")
                mock_instance.execute_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_leader_pause_via_dtmf(self, dtmf_conf_call):
        """Leader pressing '6' while playing should trigger PauseContentEvent."""
        conf_call = dtmf_conf_call
        conf_call.state.audio_content_state.status = ContentStatus.PLAYING
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock):
            event = DTMFInputEvent(phone_number="91000000002", digit="6", conf_call=conf_call)
            with patch('app.services.confevents.dtmf_input_event.PauseContentEvent') as MockPause:
                mock_instance = AsyncMock()
                MockPause.return_value = mock_instance
                await event.execute_event()
                MockPause.assert_called_once_with(conf_call=conf_call, initiator_phone="91000000002")
                mock_instance.execute_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_leader_resume_via_dtmf(self, dtmf_conf_call):
        """Leader pressing '6' while paused should trigger ResumeContentEvent."""
        conf_call = dtmf_conf_call
        conf_call.state.audio_content_state.status = ContentStatus.PAUSED
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock):
            event = DTMFInputEvent(phone_number="91000000002", digit="6", conf_call=conf_call)
            with patch('app.services.confevents.dtmf_input_event.ResumeContentEvent') as MockResume:
                mock_instance = AsyncMock()
                MockResume.return_value = mock_instance
                await event.execute_event()
                MockResume.assert_called_once_with(conf_call=conf_call, initiator_phone="91000000002")
                mock_instance.execute_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_leader_seek_backward_via_dtmf(self, dtmf_conf_call):
        """Leader pressing '7' should trigger SeekContentEvent with -10s."""
        conf_call = dtmf_conf_call
        conf_call.state.audio_content_state.status = ContentStatus.PLAYING
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock):
            event = DTMFInputEvent(phone_number="91000000002", digit="7", conf_call=conf_call)
            with patch('app.services.confevents.dtmf_input_event.SeekContentEvent') as MockSeek:
                mock_instance = AsyncMock()
                MockSeek.return_value = mock_instance
                await event.execute_event()
                MockSeek.assert_called_once_with(conf_call=conf_call, delta_seconds=-10, initiator_phone="91000000002")
                mock_instance.execute_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_leader_seek_forward_via_dtmf(self, dtmf_conf_call):
        """Leader pressing '9' should trigger SeekContentEvent with +10s."""
        conf_call = dtmf_conf_call
        conf_call.state.audio_content_state.status = ContentStatus.PLAYING
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock):
            event = DTMFInputEvent(phone_number="91000000002", digit="9", conf_call=conf_call)
            with patch('app.services.confevents.dtmf_input_event.SeekContentEvent') as MockSeek:
                mock_instance = AsyncMock()
                MockSeek.return_value = mock_instance
                await event.execute_event()
                MockSeek.assert_called_once_with(conf_call=conf_call, delta_seconds=10, initiator_phone="91000000002")
                mock_instance.execute_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_leader_speed_decrease_via_dtmf(self, dtmf_conf_call):
        """Leader pressing '*' should decrease playback speed."""
        conf_call = dtmf_conf_call
        conf_call.state.audio_content_state.status = ContentStatus.PLAYING
        conf_call.state.audio_content_state.speed = 1.0
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock):
            event = DTMFInputEvent(phone_number="91000000002", digit="*", conf_call=conf_call)
            with patch('app.services.confevents.dtmf_input_event.SetPlaybackSpeedEvent') as MockSpeed:
                mock_instance = AsyncMock()
                MockSpeed.return_value = mock_instance
                await event.execute_event()
                MockSpeed.assert_called_once_with(conf_call=conf_call, speed=0.75, initiator_phone="91000000002")
                mock_instance.execute_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_leader_speed_increase_via_dtmf(self, dtmf_conf_call):
        """Leader pressing '#' should increase playback speed."""
        conf_call = dtmf_conf_call
        conf_call.state.audio_content_state.status = ContentStatus.PLAYING
        conf_call.state.audio_content_state.speed = 1.0
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock):
            event = DTMFInputEvent(phone_number="91000000002", digit="#", conf_call=conf_call)
            with patch('app.services.confevents.dtmf_input_event.SetPlaybackSpeedEvent') as MockSpeed:
                mock_instance = AsyncMock()
                MockSpeed.return_value = mock_instance
                await event.execute_event()
                MockSpeed.assert_called_once_with(conf_call=conf_call, speed=1.25, initiator_phone="91000000002")
                mock_instance.execute_event.assert_called_once()

    @pytest.mark.asyncio
    async def test_non_leader_dtmf_1_ignored(self, dtmf_conf_call):
        """Non-leader student pressing '1' should not trigger mute."""
        conf_call = dtmf_conf_call
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock):
            event = DTMFInputEvent(phone_number="91000000003", digit="1", conf_call=conf_call)
            with patch('app.services.confevents.dtmf_input_event.MuteAllEvent') as MockMute:
                await event.execute_event()
                MockMute.assert_not_called()

    @pytest.mark.asyncio
    async def test_leader_dtmf_ignored_when_no_content(self, dtmf_conf_call):
        """Leader pressing '6', '7', '9', '*', '#' with no content loaded should be ignored."""
        conf_call = dtmf_conf_call
        conf_call.state.audio_content_state.status = ContentStatus.STOPPED
        with patch.object(conf_call, 'update_state', new_callable=AsyncMock):
            for digit in ["6", "7", "9", "*", "#"]:
                event = DTMFInputEvent(phone_number="91000000002", digit=digit, conf_call=conf_call)
                with patch('app.services.confevents.dtmf_input_event.PauseContentEvent') as MockPause, \
                     patch('app.services.confevents.dtmf_input_event.SeekContentEvent') as MockSeek, \
                     patch('app.services.confevents.dtmf_input_event.SetPlaybackSpeedEvent') as MockSpeed:
                    await event.execute_event()
                    MockPause.assert_not_called()
                    MockSeek.assert_not_called()
                    MockSpeed.assert_not_called()

    def test_leader_phone_validation(self, mock_services):
        """Leader phone not in student_phones should be ignored."""
        communication_api, storage_manager, connection_manager = mock_services
        conf_call = ConferenceCall(
            conf_id="validation-test",
            communication_api=communication_api,
            storage_manager=storage_manager,
            connection_manager=connection_manager
        )
        conf_call.set_participant_state("91000000001", ["91000000002"], leader_phone="91000000099")
        assert conf_call.state.leader_phone_number is None

    def test_leader_phone_valid(self, mock_services):
        """Leader phone in student_phones should be accepted."""
        communication_api, storage_manager, connection_manager = mock_services
        conf_call = ConferenceCall(
            conf_id="validation-test",
            communication_api=communication_api,
            storage_manager=storage_manager,
            connection_manager=connection_manager
        )
        conf_call.set_participant_state("91000000001", ["91000000002"], leader_phone="91000000002")
        assert conf_call.state.leader_phone_number == "91000000002"


if __name__ == "__main__":
    pytest.main([__file__])