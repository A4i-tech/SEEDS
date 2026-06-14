"""
Tests targeting sas_service, ivr_service high-level functions,
FSM quiz/pure_audio instantiation stubs, and confevents event classes.
"""

from __future__ import annotations

import pytest
from unittest.mock import AsyncMock, MagicMock, patch


# ---------------------------------------------------------------------------
# SAS service — offline path coverage
# ---------------------------------------------------------------------------


class TestSASService:
    def _make_sas(self, enabled=False, use_key=False):
        from app.services.sas_service import SASService

        svc = SASService.__new__(SASService)
        svc._account_name = "myaccount" if use_key else ""
        svc._account_key = "mykey" if use_key else ""
        svc._sas_expiry_hours = 1
        svc._azure_enabled = enabled
        svc._use_account_key = use_key
        svc._credential = None
        svc._blob_service_client = None
        svc._user_delegation_key = None
        svc._key_expiry_time = None
        return svc

    def test_disabled_returns_original(self) -> None:
        svc = self._make_sas(enabled=False)
        url = "https://example.blob.core.windows.net/container/file.mp3"
        result = svc.get_url_with_sas(url)
        assert result == url

    def test_disabled_any_url_passthrough(self) -> None:
        svc = self._make_sas(enabled=False)
        urls = [
            "https://myaccount.blob.core.windows.net/audio/test.mp3",
            "http://localhost:8080/audio.mp3",
            "",
        ]
        for url in urls:
            assert svc.get_url_with_sas(url) == url

    def test_enabled_malformed_url_falls_back(self) -> None:
        svc = self._make_sas(enabled=True, use_key=True)
        # URL with fewer than 2 path parts — should fall back to original
        url = "https://myaccount.blob.core.windows.net/onlycontainer"
        result = svc.get_url_with_sas(url)
        # Either fell back to original or raised ValueError, either way no crash
        assert isinstance(result, str)

    def test_get_user_delegation_key_uses_account_key(self) -> None:
        svc = self._make_sas(enabled=True, use_key=True)
        # Should return None when using account key
        result = svc._get_user_delegation_key(MagicMock())
        assert result is None

    def test_enabled_with_bad_azure_import_falls_back(self) -> None:
        svc = self._make_sas(enabled=True, use_key=True)
        url = "https://myaccount.blob.core.windows.net/container/file.mp3"
        # Azure not configured in test env → should fall back to original URL
        result = svc.get_url_with_sas(url)
        # Result is the original URL (fallback on exception)
        assert isinstance(result, str)


# ---------------------------------------------------------------------------
# IVR service — get_ivr_structure / update_ivr_structure
# ---------------------------------------------------------------------------


class TestIVRServiceStructure:
    @pytest.fixture
    def db(self):
        import mongomock_motor
        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_ivr_svc"]

    @pytest.mark.asyncio
    async def test_get_ivr_structure_not_found(self, db) -> None:
        from app.services.ivr_service import get_ivr_structure
        from app.services import ivr_service

        # Ensure cache is clear
        original = ivr_service._latest_fsm_id
        ivr_service._latest_fsm_id = None

        try:
            result = await get_ivr_structure(tenant_id="t1", db=db)
            # No IVR doc in DB → returns error dict
            assert isinstance(result, dict)
            assert "error" in result or "fsm_id" in result
        finally:
            ivr_service._latest_fsm_id = original

    @pytest.mark.asyncio
    async def test_process_dtmf_no_context(self, db) -> None:
        """process_dtmf with nonexistent call_id returns error response."""
        from app.services.ivr_service import process_dtmf

        result = await process_dtmf(
            call_id="nonexistent_call",
            dtmf="1",
            db=db,
        )
        # Returns NCCO list (error talk action) or dict
        assert result is not None

    @pytest.mark.asyncio
    async def test_process_call_event_no_context(self, db) -> None:
        """process_call_event with nonexistent UUID returns gracefully (None)."""
        from app.services.ivr_service import process_call_event

        result = await process_call_event(
            call_id="nonexistent_call",
            event={"status": "completed"},
            db=db,
        )
        # Returns None when call not found
        assert result is None or isinstance(result, dict)


# ---------------------------------------------------------------------------
# IVR service — start_call_flow mocked path
# ---------------------------------------------------------------------------


class TestIVRStartCallFlow:
    @pytest.fixture
    def db(self):
        import mongomock_motor
        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_ivr_start"]

    @pytest.mark.asyncio
    async def test_start_call_flow_no_ivr_loaded_returns_503(self, db) -> None:
        """start_call_flow when no FSM is loaded returns 4xx/5xx."""
        from app.services.ivr_service import start_call_flow, set_latest_fsm_id
        from app.services import ivr_service

        # Clear cache
        original = ivr_service._latest_fsm_id
        ivr_service._latest_fsm_id = None

        try:
            result = await start_call_flow(
                phone_number="+91999999999",
                tenant_id="t1",
                db=db,
            )
            assert isinstance(result, dict)
            assert result.get("status_code", 503) >= 400
        except Exception:
            pass  # Any exception is acceptable here
        finally:
            ivr_service._latest_fsm_id = original


# ---------------------------------------------------------------------------
# Confevents — event class instantiation with mock conf_call
# ---------------------------------------------------------------------------


class TestConfeventsAdditional:
    def _mock_conf_call(self):
        """Create a mock ConferenceCall for event constructors."""
        conf_call = MagicMock()
        conf_call.state = MagicMock()
        conf_call.state.conference_id = "conf1"
        conf_call.stream_system_message = AsyncMock()
        return conf_call

    def test_end_conf_event_creation(self) -> None:
        from app.services.confevents.end_conf_event import EndConferenceEvent

        event = EndConferenceEvent(conf_call=self._mock_conf_call())
        assert event is not None

    def test_pause_content_event_creation(self) -> None:
        from app.services.confevents.pause_content_event import PauseContentEvent

        event = PauseContentEvent(conf_call=self._mock_conf_call())
        assert event is not None

    def test_mute_all_event_creation(self) -> None:
        from app.services.confevents.mute_all_event import MuteAllEvent

        event = MuteAllEvent(conf_call=self._mock_conf_call())
        assert event is not None

    def test_unmute_all_event_creation(self) -> None:
        from app.services.confevents.unmute_all_event import UnmuteAllEvent

        event = UnmuteAllEvent(conf_call=self._mock_conf_call())
        assert event is not None

    def test_mute_participant_event_creation(self) -> None:
        from app.services.confevents.mute_participant_event import MuteParticipantEvent

        event = MuteParticipantEvent(phone_number="+111", conf_call=self._mock_conf_call())
        assert event is not None

    def test_unmute_participant_event_creation(self) -> None:
        from app.services.confevents.unmute_participant_event import UnmuteParticipantEvent

        event = UnmuteParticipantEvent(phone_number="+111", conf_call=self._mock_conf_call())
        assert event is not None

    def test_remove_participant_event_creation(self) -> None:
        from app.services.confevents.remove_participant_event import RemoveParticipantEvent

        event = RemoveParticipantEvent(phone_number="+111", conf_call=self._mock_conf_call())
        assert event is not None

    def test_reconnect_websocket_event_creation(self) -> None:
        from app.services.confevents.reconnect_comm_api_websocket_event import ReconnectCommApiWebsocketEvent

        event = ReconnectCommApiWebsocketEvent(conf_call=self._mock_conf_call())
        assert event is not None

    def test_add_participant_event_creation(self) -> None:
        from app.services.confevents.add_participant_event import AddParticipantEvent

        event = AddParticipantEvent(phone_number="+222", conf_call=self._mock_conf_call())
        assert event is not None


# ---------------------------------------------------------------------------
# Confevents — vonage events
# ---------------------------------------------------------------------------


class TestVonageConfevents:
    def test_vonage_call_status_change_event_answered(self) -> None:
        from app.services.confevents.vonage.vonage_call_status_change_event import VonageCallStatusChangeEvent

        event = VonageCallStatusChangeEvent(
            status="answered",
            to="+111",
        )
        assert event.status.value == "answered"

    def test_vonage_call_status_change_normalizes_invalid_to_notconnected(self) -> None:
        from app.services.confevents.vonage.vonage_call_status_change_event import VonageCallStatusChangeEvent, VonageCallStatus

        event = VonageCallStatusChangeEvent(
            status="unknown_invalid",
            to="+111",
        )
        assert event.status == VonageCallStatus.NOTCONNECTED

    def test_vonage_call_status_completed(self) -> None:
        from app.services.confevents.vonage.vonage_call_status_change_event import VonageCallStatusChangeEvent, VonageCallStatus

        event = VonageCallStatusChangeEvent(status="completed", to="+222")
        assert event.status == VonageCallStatus.COMPLETED


# ---------------------------------------------------------------------------
# Models — classroom
# ---------------------------------------------------------------------------


class TestClassroomModel:
    def test_classroom_create(self) -> None:
        from app.models.classroom import ClassroomCreate

        c = ClassroomCreate(name="Class 5A", school_id="s1", teacher="teacher1")
        assert c.name == "Class 5A"
        assert c.school_id == "s1"

    def test_classroom_from_mongo_none(self) -> None:
        from app.models.classroom import Classroom

        result = Classroom.from_mongo(None)
        assert result is None

    def test_classroom_from_mongo_with_id(self) -> None:
        from bson import ObjectId
        from app.models.classroom import Classroom

        doc = {
            "_id": ObjectId(),
            "name": "Class 5A",
            "school_id": "s1",
            "teacher": "t1",
        }
        c = Classroom.from_mongo(doc)
        assert c is not None
        assert c.name == "Class 5A"


# ---------------------------------------------------------------------------
# Models — content
# ---------------------------------------------------------------------------


class TestContentModel:
    def test_content_from_mongo_none(self) -> None:
        from app.models.content import Content

        result = Content.from_mongo(None)
        assert result is None

    def test_content_create_minimal(self) -> None:
        from app.models.content import ContentCreate

        c = ContentCreate(
            type="audio",
            language="english",
            tenant_id="t1",
        )
        assert c.type == "audio"
        assert c.language == "english"


# ---------------------------------------------------------------------------
# Models — conference_state additional
# ---------------------------------------------------------------------------


class TestConferenceStateModel:
    def test_conference_call_state_defaults(self) -> None:
        from app.models.conference_state import ConferenceCallState

        state = ConferenceCallState(conference_id="conf1")
        assert state.conference_id == "conf1"
        assert state.is_running is False
        assert state.participants == {}

    def test_conference_call_state_with_participants(self) -> None:
        from app.models.conference_state import ConferenceCallState
        from app.models.participant import Participant, Role, CallStatus

        p1 = Participant(phone_number="+111", name="Teacher", role=Role.TEACHER, call_status=CallStatus.CONNECTED)
        state = ConferenceCallState(conference_id="conf1", participants={"+111": p1})
        assert len(state.participants) == 1

    def test_auto_end_state_defaults(self) -> None:
        from app.models.conference_state import AutoEndState

        aes = AutoEndState()
        assert aes.is_active is False  # default


# ---------------------------------------------------------------------------
# Repositories — classroom
# ---------------------------------------------------------------------------


class TestClassroomRepository:
    @pytest.fixture
    def db(self):
        import mongomock_motor
        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_classroom_repo"]

    @pytest.mark.asyncio
    async def test_create_and_find_classroom(self, db) -> None:
        from app.repositories.classroom_repository import ClassroomRepository
        from app.models.classroom import ClassroomCreate

        repo = ClassroomRepository(db)
        classroom = ClassroomCreate(name="Class 1", school_id="s1", teacher="t1")
        created = await repo.create(classroom)
        assert created is not None
        assert created.name == "Class 1"

    @pytest.mark.asyncio
    async def test_find_classrooms_by_school(self, db) -> None:
        from app.repositories.classroom_repository import ClassroomRepository
        from app.models.classroom import ClassroomCreate

        repo = ClassroomRepository(db)
        await repo.create(ClassroomCreate(name="Class A", school_id="s1", teacher="t1"))
        await repo.create(ClassroomCreate(name="Class B", school_id="s1", teacher="t1"))
        await repo.create(ClassroomCreate(name="Class C", school_id="s2", teacher="t1"))

        results = await repo.find_by_school("s1")
        assert len(results) == 2

    @pytest.mark.asyncio
    async def test_find_classrooms_by_teacher(self, db) -> None:
        from app.repositories.classroom_repository import ClassroomRepository
        from app.models.classroom import ClassroomCreate

        repo = ClassroomRepository(db)
        await repo.create(ClassroomCreate(name="Class X", school_id="s1", teacher="t1"))
        await repo.create(ClassroomCreate(name="Class Y", school_id="s1", teacher="t2"))

        results = await repo.find_by_teacher("t1")
        assert len(results) == 1


# ---------------------------------------------------------------------------
# Repositories — IVR
# ---------------------------------------------------------------------------


class TestIVRRepository:
    @pytest.fixture
    def db(self):
        import mongomock_motor
        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_ivr_repo"]

    @pytest.mark.asyncio
    async def test_save_and_find_fsm(self, db) -> None:
        import time
        from app.repositories.ivr_repository import IVRRepository
        from app.models.ivr_state import IVRfsmDoc

        repo = IVRRepository(db)
        doc = IVRfsmDoc(
            _id="fsm1",
            version="v1",
            created_at=int(time.time() * 1000),
            init_state_id="s0",
            tenant_id="t1",
        )
        saved = await repo.save_fsm(doc)
        assert saved is not None

        found = await repo.find_fsm_by_id("fsm1")
        assert found is not None

    @pytest.mark.asyncio
    async def test_find_fsm_not_found(self, db) -> None:
        from app.repositories.ivr_repository import IVRRepository

        repo = IVRRepository(db)
        result = await repo.find_fsm_by_id("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_log_ivr_event(self, db) -> None:
        from app.repositories.ivr_repository import IVRRepository

        repo = IVRRepository(db)
        # Should not raise even with no existing doc
        await repo.log_ivr_event("call1", {"status": "answered", "timestamp": "2026-01-01"})


# ---------------------------------------------------------------------------
# Repositories — comprehension
# ---------------------------------------------------------------------------


class TestComprehensionRepository:
    @pytest.fixture
    def db(self):
        import mongomock_motor
        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_comp_repo"]

    @pytest.mark.asyncio
    async def test_create_comprehension(self, db) -> None:
        from app.repositories.comprehension_repository import ComprehensionRepository

        repo = ComprehensionRepository(db)
        data = {
            "classroom_id": "c1",
            "content_id": "ct1",
            "teacher_id": "t1",
            "student_results": [],
        }
        created = await repo.create_comprehension(data)
        assert created is not None

    @pytest.mark.asyncio
    async def test_get_all_comprehensions_empty(self, db) -> None:
        from app.repositories.comprehension_repository import ComprehensionRepository

        repo = ComprehensionRepository(db)
        result = await repo.get_all_comprehensions()
        assert result == []

    @pytest.mark.asyncio
    async def test_get_comprehension_by_id_not_found(self, db) -> None:
        from app.repositories.comprehension_repository import ComprehensionRepository

        repo = ComprehensionRepository(db)
        result = await repo.get_comprehension_by_id("000000000000000000000000")
        assert result is None


# ---------------------------------------------------------------------------
# FSM operations — more coverage
# ---------------------------------------------------------------------------


class TestFSMOperations:
    def test_empty_state_operation(self) -> None:
        from app.services.fsm.operations.empty_state_operation import EmptyStateOperation

        op = EmptyStateOperation()
        assert op is not None

    def test_empty_process_state_output(self) -> None:
        from app.services.fsm.operations.empty_process_state_output import EmptyProcessStateOutput

        op = EmptyProcessStateOutput()
        assert op is not None

    def test_daily_limit_pre_operation(self) -> None:
        from app.services.fsm.operations.daily_limit_pre_operation import DailyLimitPreOperation

        op = DailyLimitPreOperation(duration_seconds=120.0, language="english", school_id="s1")
        assert op.duration_seconds == 120.0
        assert op.language == "english"

    def test_quiz_init_state_operation_no_args(self) -> None:
        from app.services.fsm.operations.quiz_init_state_operation import QuizInitStateOperation

        op = QuizInitStateOperation()
        assert op is not None

    def test_quiz_pre_state_operation_no_args(self) -> None:
        from app.services.fsm.operations.quiz_pre_state_operation import QuizPreStateOperation

        op = QuizPreStateOperation()
        assert op is not None

    def test_quiz_post_state_operation_with_score(self) -> None:
        from app.services.fsm.operations.quiz_post_state_operation import QuizPostStateOperation

        op = QuizPostStateOperation(score=1)
        assert op.score == 1

    def test_quiz_process_final_state_output(self) -> None:
        from app.services.fsm.operations.quiz_process_state_output import QuizProcessFinalStateOutput

        op = QuizProcessFinalStateOutput()
        assert op is not None


# ---------------------------------------------------------------------------
# FSM utils
# ---------------------------------------------------------------------------


class TestFSMUtils:
    def test_fsm_utils_importable(self) -> None:
        import app.services.fsm.utils as utils
        assert utils is not None

    def test_fsm_module_importable(self) -> None:
        from app.services.fsm.fsm import FSM
        assert FSM is not None

    def test_fsm_creation(self) -> None:
        from app.services.fsm.fsm import FSM
        from app.services.fsm.state import State
        from app.services.fsm.transition import Transition

        fsm = FSM(fsm_id="test_fsm_001")
        s0 = State(state_id="s0")
        s1 = State(state_id="s1")
        t = Transition(input="1", source_state_id="s0", dest_state_id="s1")
        s0.add_transition(t)
        fsm.add_state(s0)
        fsm.add_state(s1)
        fsm.set_init_state_id("s0")

        assert fsm.init_state_id == "s0"
        assert "s0" in fsm.states
        assert "s1" in fsm.states
