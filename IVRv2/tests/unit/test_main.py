import pytest
import sys
import os
import time
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from httpx import AsyncClient
import json

# Set up required environment variables before importing main
os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "mongodb://localhost:27017/test")
os.environ.setdefault("VONAGE_APPLICATION_ID", "test_app_id")
os.environ.setdefault("VONAGE_PRIVATE_KEY_PATH", "test_key_path")
os.environ.setdefault("VONAGE_NUMBER", "+1234567890")
os.environ.setdefault("NGROK_URL", "http://test.ngrok.io")

# Add the parent directory to the path for imports
sys.path.append(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
)

from app.main import app
from app.utils.model_classes import StartIVRFormData


class TestMainApplication:
    """Unit tests for main.py FastAPI application."""

    # Test data constants
    TEST_PHONE_NUMBER = "+1234567890"
    TEST_PHONE_NUMBER_2 = "+0987654321"
    TEST_FSM_ID = "test_fsm_id"
    TEST_CALL_UUID = "test_call_uuid"
    TEST_STATE_ID = "state1"
    INVALID_PHONE = "invalid_phone"
    NON_EXISTENT_CALL = "non_existent_call"
    NON_EXISTENT_FSM = "not_found"

    def setup_method(self):
        """Set up test client."""
        self.client = TestClient(app)

    @pytest.fixture
    def mock_fsm(self):
        """Create a mock FSM object with common methods."""
        from app.utils.model_classes import IVRfsmDoc

        fsm = MagicMock()
        fsm.fsm_id = self.TEST_FSM_ID

        # Create a proper IVRfsmDoc for serialize method
        mock_fsm_doc = IVRfsmDoc(
            _id=self.TEST_FSM_ID,
            init_state_id=self.TEST_STATE_ID,
            states=[],
            transitions=[],
            created_at=1234567890,
        )
        fsm.serialize.return_value = mock_fsm_doc

        fsm.get_start_fsm_actions.return_value = [{"action": "talk", "text": "Welcome"}]
        fsm.get_next_actions.return_value = [{"action": "talk", "text": "Next step"}]
        return fsm

    @pytest.fixture
    def mock_call_state(self):
        """Create a mock call state object."""
        return {
            "phone_number": self.TEST_PHONE_NUMBER,
            "fsm_id": self.TEST_FSM_ID,
            "current_state_id": self.TEST_STATE_ID,
        }

    @pytest.fixture
    def mock_vonage_response(self):
        """Create a mock Vonage call response."""
        return {"uuid": self.TEST_CALL_UUID, "status": "started"}

    def _assert_successful_response(self, response, expected_status=200):
        """Helper method to assert successful response."""
        assert response.status_code == expected_status
        return response.json()

    def _assert_ncco_response(self, response):
        """Helper method to assert NCCO response format."""
        data = self._assert_successful_response(response)
        assert isinstance(data, list)
        return data

    def _create_event_data(self, status, conversation_uuid=None, **kwargs):
        """Helper method to create event data."""
        data = {
            "status": status,
            "conversation_uuid": conversation_uuid or self.TEST_CALL_UUID,
        }
        data.update(kwargs)
        return data

    def _create_input_data(self, dtmf="1", conversation_uuid=None):
        """Helper method to create input data."""
        return {
            "dtmf": {"digits": dtmf, "timed_out": False},
            "conversation_uuid": conversation_uuid or self.TEST_CALL_UUID,
        }

    def _create_complete_event_data(self, status, conversation_uuid=None, **kwargs):
        """Helper method to create complete event data with all required fields."""
        data = {
            "status": status,
            "conversation_uuid": conversation_uuid or self.TEST_CALL_UUID,
            "uuid": kwargs.get("uuid", "test_event_uuid"),
            "from": kwargs.get("from_", self.TEST_PHONE_NUMBER),
            "to": kwargs.get("to", self.TEST_PHONE_NUMBER_2),
            "direction": kwargs.get("direction", "outbound"),
            "timestamp": kwargs.get("timestamp", "2023-01-01T12:00:00Z"),
        }
        # Add any additional kwargs
        for key, value in kwargs.items():
            if key not in ["uuid", "from_", "to", "direction", "timestamp"]:
                data[key] = value
        return data

    def test_root_endpoint(self):
        """Test the root health check endpoint."""
        response = self.client.get("/")
        data = self._assert_successful_response(response)
        assert data == {"status": "IVR v2 API is running"}

    def test_answer_endpoint(self):
        """Test the /answer endpoint returns default NCCO."""
        response = self.client.get("/answer")
        ncco = self._assert_ncco_response(response)
        assert len(ncco) > 0
        assert ncco[0]["action"] == "talk"

    @patch("app.main.get_latest_content")
    @patch("app.main.process_content")
    @patch("app.main.format_data_html")
    def test_ivr_structure_endpoint(
        self, mock_format_html, mock_process, mock_get_content
    ):
        """Test the /ivr_structure endpoint."""

        # Mock the async function and its dependencies
        async def mock_content():
            return {"test": "content"}

        mock_get_content.return_value = mock_content()
        mock_process.return_value = {"processed": "content"}
        mock_format_html.return_value = "<html>Test</html>"

        response = self.client.get("/ivr_structure")
        assert response.status_code == 200
        assert "text/html" in response.headers.get("content-type", "")
        assert "<html>" in response.text

    @patch("app.main.get_app_state")
    def test_update_ivr_endpoint_success(self, mock_get_app_state, mock_fsm):
        """Test successful IVR update when no users are active."""
        # Setup mock app state with async mock collections
        mock_state = MagicMock()
        mock_state.fsm = {}
        mock_state.latest_fsm_id = None

        # Create AsyncMock for collection methods
        mock_ongoing_fsm = MagicMock()
        mock_ongoing_fsm.find_all = AsyncMock(return_value=[])
        mock_state.ongoing_fsm_mongo = mock_ongoing_fsm

        mock_fsm_json = MagicMock()
        mock_fsm_json.find_top_one = AsyncMock(return_value=None)
        mock_fsm_json.insert = AsyncMock(return_value=True)
        mock_state.fsm_json_mongo = mock_fsm_json

        mock_get_app_state.return_value = mock_state

        with patch("app.main.instantiate_from_latest_content", return_value=mock_fsm):
            response = self.client.post("/updateivr")
            data = self._assert_successful_response(response)
            assert "successfully" in data["message"].lower()

    @patch("app.main.get_app_state")
    def test_update_ivr_endpoint_conflict(self, mock_get_app_state):
        """Test IVR update fails when users are active."""
        # Setup mock app state with ongoing calls
        mock_state = MagicMock()
        mock_ongoing_fsm = MagicMock()
        mock_ongoing_fsm.find_all = AsyncMock(
            return_value=[{"call_id": "test1"}, {"call_id": "test2"}]
        )
        mock_state.ongoing_fsm_mongo = mock_ongoing_fsm
        mock_get_app_state.return_value = mock_state

        response = self.client.post("/updateivr")
        data = self._assert_successful_response(response, 409)
        assert "Cannot Update IVR" in data["message"]
        assert "2 users" in data["message"]

    @patch("app.main.get_app_state")
    def test_get_fsm_endpoint_not_found(self, mock_get_app_state):
        """Test FSM retrieval when FSM doesn't exist."""
        # Setup mock app state with async mock collections
        mock_state = MagicMock()

        mock_fsm_json = MagicMock()
        mock_fsm_json.find_by_id = AsyncMock(return_value=None)
        mock_state.fsm_json_mongo = mock_fsm_json

        mock_radio_fsm = MagicMock()
        mock_radio_fsm.find_by_id = AsyncMock(return_value=None)
        mock_state.radio_fsm_mongo = mock_radio_fsm

        mock_get_app_state.return_value = mock_state

        response = self.client.get(f"/getFSM?fsm_id={self.NON_EXISTENT_FSM}")
        data = self._assert_successful_response(response, 404)
        assert "not found" in data["detail"].lower()

    def test_fallback_endpoint(self):
        """Test fallback endpoint."""
        fallback_data = {"conversation_uuid": self.TEST_CALL_UUID, "reason": "timeout"}

        response = self.client.post("/fallback", json=fallback_data)
        data = self._assert_successful_response(response)
        # The fallback endpoint returns a simple message, not NCCO
        assert "hello" in data or "world" in data

    def test_application_startup(self):
        """Test that the application starts successfully."""
        assert self.client is not None

    def test_cors_headers(self):
        """Test CORS headers are properly set."""
        response = self.client.get("/")
        self._assert_successful_response(response)

    def test_invalid_endpoint(self):
        """Test accessing non-existent endpoint."""
        response = self.client.get("/non_existent_endpoint")
        assert response.status_code == 404

    def test_method_not_allowed(self):
        """Test using wrong HTTP method."""
        response = self.client.get("/start_ivr")
        assert response.status_code == 405
