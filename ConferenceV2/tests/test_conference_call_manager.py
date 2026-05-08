import sys
import os
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "mongodb://localhost:27017/test")
os.environ.setdefault("STORAGE_ACCOUNT_NAME", "test")
os.environ.setdefault("ENVIRONMENT", "development")
os.environ.setdefault(
    "APPLICATIONINSIGHTS_CONNECTION_STRING",
    "InstrumentationKey=test-key;IngestionEndpoint=https://test.com/",
)

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Remove any mock placed by other test files so we import the real class
sys.modules.pop("app.services.singletons.conference_call_manager", None)

from app.models.action_history import ActionType
from app.services.communication_api import CommunicationAPIType
from app.services.smartphone_connection_manager import SmartphoneConnectionManagerType
from app.services.storage_manager.base_storage_manager import StorageManager
from app.services.singletons.conference_call_manager import ConferenceCallManager

TEACHER = "918904954840"
STUDENTS = ["917777777777"]


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture
def mock_storage():
    storage = AsyncMock(spec=StorageManager)
    storage.save_state = AsyncMock()
    return storage


@pytest.fixture
def mock_comm_api():
    api = AsyncMock()
    api.start_conf = AsyncMock()
    api.get_is_websocket_connected = MagicMock(return_value=False)
    return api


@pytest.fixture
def mock_connection_manager():
    cm = AsyncMock()
    cm.send_message_to_client = AsyncMock()
    cm.connect = AsyncMock()
    cm.disconnect = AsyncMock()
    return cm


@pytest.fixture
def manager(mock_storage, mock_comm_api, mock_connection_manager):
    mgr = ConferenceCallManager(
        communication_api_type=CommunicationAPIType.VONAGE,
        smartphone_connection_manager_type=SmartphoneConnectionManagerType.SSE,
        storage_manager=mock_storage,
    )
    mgr.communication_api_factory.create = MagicMock(return_value=mock_comm_api)
    mgr.smartphone_connection_manager_factory.create = MagicMock(return_value=mock_connection_manager)
    return mgr


# ── Helpers ───────────────────────────────────────────────────────────────────

def _action_types_in_call(mock_storage, call_index: int) -> list[str]:
    _, state = mock_storage.save_state.call_args_list[call_index][0]
    return [a["action_type"] for a in state.get("action_history", [])]


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestCreateConference:

    @pytest.mark.asyncio
    async def test_persists_conference_created(self, manager, mock_storage):
        """create_conference must write CONFERENCE_CREATED to MongoDB."""
        conf = await manager.create_conference(TEACHER, STUDENTS)

        mock_storage.save_state.assert_called_once()
        conf_id_arg, state = mock_storage.save_state.call_args[0]
        assert conf_id_arg == conf.conf_id
        action_types = [a["action_type"] for a in state["action_history"]]
        assert ActionType.CONFERENCE_CREATED.value in action_types

    @pytest.mark.asyncio
    async def test_created_entry_has_correct_metadata(self, manager, mock_storage):
        """CONFERENCE_CREATED metadata must include teacher and student phones."""
        await manager.create_conference(TEACHER, STUDENTS)

        _, state = mock_storage.save_state.call_args[0]
        created = next(
            a for a in state["action_history"]
            if a["action_type"] == ActionType.CONFERENCE_CREATED.value
        )
        assert created["metadata"]["teacher_phone"] == TEACHER
        assert created["metadata"]["student_phones"] == STUDENTS
        assert created["owner"] == TEACHER


class TestStartConferenceCall:

    @pytest.mark.asyncio
    async def test_persists_start_requested_before_vonage(self, manager, mock_storage):
        """CONFERENCE_START_REQUESTED must be in MongoDB before Vonage is called."""
        conf = await manager.create_conference(TEACHER, STUDENTS)
        mock_storage.reset_mock()

        with patch.object(conf, "start_processing_conf_events_from_queue"), \
             patch.object(conf, "start_remote_audio_relay"), \
             patch.object(conf, "start_conference", new_callable=AsyncMock):
            await manager.start_conference_call(conf.conf_id)

        first_save_types = _action_types_in_call(mock_storage, 0)
        assert ActionType.CONFERENCE_START_REQUESTED.value in first_save_types

    @pytest.mark.asyncio
    async def test_process_restart_safety_state_before_vonage_call(self, manager, mock_storage):
        """
        MongoDB must be written before Vonage call starts.
        If process restarts between update_state() and start_conference(),
        START_REQUESTED is already persisted — no lost state window.
        """
        conf = await manager.create_conference(TEACHER, STUDENTS)
        mock_storage.reset_mock()

        call_order = []

        original_update_state = conf.update_state

        async def tracking_update_state():
            call_order.append("update_state")
            await original_update_state()

        async def tracking_start_conference():
            call_order.append("start_conference")

        with patch.object(conf, "start_processing_conf_events_from_queue"), \
             patch.object(conf, "start_remote_audio_relay"), \
             patch.object(conf, "update_state", new=AsyncMock(side_effect=tracking_update_state)), \
             patch.object(conf, "start_conference", new=AsyncMock(side_effect=tracking_start_conference)):
            await manager.start_conference_call(conf.conf_id)

        assert call_order == ["update_state", "start_conference"], (
            "update_state (MongoDB persist) must complete before start_conference (Vonage call)"
        )

    @pytest.mark.asyncio
    async def test_vonage_failure_persists_start_failed_with_error(self, manager, mock_storage):
        """When Vonage call fails, CONFERENCE_START_FAILED is persisted with error class and message."""
        conf = await manager.create_conference(TEACHER, STUDENTS)
        mock_storage.reset_mock()

        vonage_error = RuntimeError("Vonage unreachable")

        with patch.object(conf, "start_processing_conf_events_from_queue"), \
             patch.object(conf, "start_remote_audio_relay"), \
             patch.object(conf, "start_conference", side_effect=vonage_error):
            with pytest.raises(RuntimeError, match="Vonage unreachable"):
                await manager.start_conference_call(conf.conf_id)

        last_state = mock_storage.save_state.call_args_list[-1][0][1]
        failed = [
            a for a in last_state["action_history"]
            if a["action_type"] == ActionType.CONFERENCE_START_FAILED.value
        ]
        assert len(failed) == 1
        assert failed[0]["metadata"]["error"] == "RuntimeError"
        assert "Vonage unreachable" in failed[0]["metadata"]["detail"]

    @pytest.mark.asyncio
    async def test_vonage_failure_re_raises_original_exception(self, manager, mock_storage):
        """The original exception must propagate even if the failure persist itself fails."""
        conf = await manager.create_conference(TEACHER, STUDENTS)

        vonage_error = RuntimeError("Vonage unreachable")
        mock_storage.save_state.side_effect = [None, None, Exception("MongoDB down")]

        with patch.object(conf, "start_processing_conf_events_from_queue"), \
             patch.object(conf, "start_remote_audio_relay"), \
             patch.object(conf, "start_conference", side_effect=vonage_error):
            with pytest.raises(RuntimeError, match="Vonage unreachable"):
                await manager.start_conference_call(conf.conf_id)

    @pytest.mark.asyncio
    async def test_background_tasks_stopped_on_start_failure(self, manager, mock_storage):
        """On start failure, background tasks must be cancelled — no zombie tasks."""
        conf = await manager.create_conference(TEACHER, STUDENTS)

        mock_stop_queue = MagicMock()
        mock_stop_relay = MagicMock()

        with patch.object(conf, "start_processing_conf_events_from_queue"), \
             patch.object(conf, "start_remote_audio_relay"), \
             patch.object(conf, "end_processing_conf_events_from_queue", mock_stop_queue), \
             patch.object(conf, "stop_remote_audio_relay", mock_stop_relay), \
             patch.object(conf, "start_conference", side_effect=RuntimeError("fail")):
            with pytest.raises(RuntimeError):
                await manager.start_conference_call(conf.conf_id)

        mock_stop_queue.assert_called_once()
        mock_stop_relay.assert_called_once()
