import pytest
from unittest.mock import MagicMock
from datetime import datetime

from app.fsm.operations.daily_limit_pre_operation import DailyLimitPreOperation
from app.utils.model_classes import IVRCallStateMongoDoc


@pytest.fixture
def mock_fsm():
    fsm = MagicMock()
    fsm.fsm_id = "test-fsm-id"
    return fsm


@pytest.fixture
def mock_ivr_state():
    return IVRCallStateMongoDoc(
        _id="test-conv-id",
        phone_number="+919876543210",
        fsm_id="test-fsm-id",
        current_state_id="LA0-TH0-EX0-TI0",
        created_at=datetime.now(),
        tenant_id="tenant-1",
    )


class TestDailyLimitPreOperation:
    def test_serialization(self):
        op = DailyLimitPreOperation(duration_seconds=180, language="kannada", school_id="school-1")
        json_data = op.to_json()
        assert json_data["__class__"] == "DailyLimitPreOperation"
        assert json_data["attributes"]["duration_seconds"] == 180
        assert json_data["attributes"]["language"] == "kannada"
        assert json_data["attributes"]["school_id"] == "school-1"

    def test_deserialization(self):
        op = DailyLimitPreOperation(duration_seconds=180, language="english", school_id="school-1")
        json_data = op.to_json()
        from app.base_classes.base_fsm_operation import FSMOperation
        restored = FSMOperation.from_json(json_data)
        assert isinstance(restored, DailyLimitPreOperation)
        assert restored.duration_seconds == 180
        assert restored.language == "english"
        assert restored.school_id == "school-1"

    def test_execute_sets_limit_check_flag(self, mock_fsm, mock_ivr_state):
        op = DailyLimitPreOperation(duration_seconds=180, language="english", school_id="school-1")
        op.execute(mock_fsm, mock_ivr_state)

        assert "_daily_limit_check" in mock_ivr_state.experience_data
        check = mock_ivr_state.experience_data["_daily_limit_check"]
        assert check["duration_seconds"] == 180
        assert check["language"] == "english"
        assert check["school_id"] == "school-1"

    def test_execute_with_none_state_doc(self, mock_fsm):
        op = DailyLimitPreOperation(duration_seconds=180, language="english")
        # Should not raise
        op.execute(mock_fsm, None)
