"""
Miscellaneous coverage tests targeting models, FSM constants,
quiz model, IVR constants, SAS service (offline), and platform utilities.
"""

from __future__ import annotations

import pytest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# Quiz model
# ---------------------------------------------------------------------------


class TestQuizModel:
    def test_quiz_option_defaults(self) -> None:
        from app.models.quiz import QuizOption

        opt = QuizOption(text="Option A", url="http://example.com/a.mp3")
        assert opt.text == "Option A"
        assert opt.id is not None  # auto-generated uuid

    def test_quiz_question(self) -> None:
        from app.models.quiz import QuizOption, QuizQuestion

        q = QuizOption(text="What is 2+2?")
        a1 = QuizOption(text="3")
        a2 = QuizOption(text="4")
        qq = QuizQuestion(question=q, options=[a1, a2], correct_option_id=a2.id)
        assert qq.correct_option_id == a2.id
        assert len(qq.options) == 2

    def test_quiz_from_mongo_none(self) -> None:
        from app.models.quiz import Quiz

        result = Quiz.from_mongo(None)
        assert result is None

    def test_quiz_from_mongo_with_objectid(self) -> None:
        from bson import ObjectId

        from app.models.quiz import Quiz
        from app.models.content import TextContent

        oid = ObjectId()
        doc = {
            "_id": oid,
            "language": "english",
            "title": {"local": "Test Quiz", "english": "Test Quiz"},
            "theme": {"local": "Theme", "english": "Theme"},
            "positiveMarks": 1.0,
            "negativeMarks": 0.25,
            "createdBy": "teacher1",
        }
        quiz = Quiz.from_mongo(doc)
        assert isinstance(quiz.id, str)
        assert quiz.language == "english"

    def test_quiz_option_default_url(self) -> None:
        from app.models.quiz import QuizOption

        opt = QuizOption(text="Something")
        assert opt.url == "<NOT CREATED>"


# ---------------------------------------------------------------------------
# IVR constants
# ---------------------------------------------------------------------------


class TestIVRConstants:
    def test_language_dialog_urls_has_all_languages(self) -> None:
        from app.services.fsm.instantiation.ivr_constants import languageDialogUrls

        expected = ["english", "kannada", "hindi", "bengali", "tamil", "odia", "marathi"]
        for lang in expected:
            assert lang in languageDialogUrls

    def test_get_pull_menu_main_url(self) -> None:
        from app.services.fsm.instantiation.ivr_constants import get_pull_menu_main_url

        url = get_pull_menu_main_url()
        assert isinstance(url, str)
        assert "blob.core.windows.net" in url or url == "https://.blob.core.windows.net/pull-model-menus/"

    def test_get_content_url(self) -> None:
        from app.services.fsm.instantiation.ivr_constants import get_content_url

        url = get_content_url()
        assert isinstance(url, str)
        assert "output-container" in url or url.endswith("output-container/")

    def test_speed_control_instruction(self) -> None:
        from app.services.fsm.instantiation.speed_control import get_speed_instruction

        instruction = get_speed_instruction("english")
        assert isinstance(instruction, str)
        assert len(instruction) > 0

    def test_speed_control_unknown_language_falls_back_to_english(self) -> None:
        from app.services.fsm.instantiation.speed_control import get_speed_instruction

        instruction = get_speed_instruction("unknown_language")
        # Falls back to English
        assert "star" in instruction.lower() or "press" in instruction.lower()


# ---------------------------------------------------------------------------
# Platform — JWT utilities
# ---------------------------------------------------------------------------


class TestJWTUtilities:
    def test_create_and_verify_token(self) -> None:
        from app.platform.auth.jwt import create_access_token, verify_token

        payload = {"sub": "user123", "role": "teacher"}
        token = create_access_token(payload)
        decoded = verify_token(token)
        assert decoded["sub"] == "user123"
        assert decoded["role"] == "teacher"

    def test_invalid_token_raises(self) -> None:
        from app.platform.auth.jwt import verify_token

        with pytest.raises(Exception):
            verify_token("not.a.valid.token")


# ---------------------------------------------------------------------------
# Platform — telemetry
# ---------------------------------------------------------------------------


class TestTelemetry:
    def test_get_counter_returns_something(self) -> None:
        from app.platform.telemetry import get_counter

        counter = get_counter("test.counter")
        assert counter is not None
        # add should not raise
        counter.add(1, {"test": "attr"})

    def test_get_histogram_returns_something(self) -> None:
        from app.platform.telemetry import get_histogram

        hist = get_histogram("test.histogram")
        assert hist is not None
        hist.record(1.5)


# ---------------------------------------------------------------------------
# Platform — authz helpers
# ---------------------------------------------------------------------------


class TestAuthzHelpers:
    def test_assert_same_tenant_matching(self) -> None:
        from app.platform.authz.tenant_scope import assert_same_tenant

        user = {"sub": "u1", "role": "teacher", "tenant_id": "t1"}
        # Should not raise
        assert_same_tenant(user, "t1")

    def test_assert_same_tenant_mismatched(self) -> None:
        from app.platform.authz.tenant_scope import assert_same_tenant
        from app.platform.error_handling import ForbiddenError

        user = {"sub": "u1", "role": "teacher", "tenant_id": "t1"}
        with pytest.raises(ForbiddenError):
            assert_same_tenant(user, "t2")

    def test_assert_same_tenant_tenant_role(self) -> None:
        from app.platform.authz.tenant_scope import assert_same_tenant

        # Tenant role: tenant_id is derived from sub
        user = {"sub": "mytenant1", "role": "tenant"}
        assert_same_tenant(user, "mytenant1")  # should pass


# ---------------------------------------------------------------------------
# Models — action_history
# ---------------------------------------------------------------------------


class TestActionHistory:
    def test_action_history_creation(self) -> None:
        from app.models.action_history import ActionHistory, ActionType

        ah = ActionHistory(
            timestamp="2026-01-01T00:00:00",
            action_type=ActionType.CONFERENCE_CREATED,
            metadata={"key": "val"},
            owner="+111",
        )
        assert ah.action_type == ActionType.CONFERENCE_CREATED
        assert ah.owner == "+111"

    def test_all_action_types_are_strings(self) -> None:
        from app.models.action_history import ActionType

        for at in ActionType:
            assert isinstance(at.value, str)


# ---------------------------------------------------------------------------
# Models — playback_state
# ---------------------------------------------------------------------------


class TestPlaybackState:
    def test_audio_content_state_defaults(self) -> None:
        from app.models.playback_state import AudioContentState, ContentStatus

        state = AudioContentState()
        assert state.status == ContentStatus.STOPPED

    def test_content_status_enum_values(self) -> None:
        from app.models.playback_state import ContentStatus

        assert ContentStatus.PLAYING is not None
        assert ContentStatus.PAUSED is not None
        assert ContentStatus.STOPPED is not None

    def test_content_status_starting(self) -> None:
        from app.models.playback_state import ContentStatus

        assert ContentStatus.STARTING is not None


# ---------------------------------------------------------------------------
# Models — call
# ---------------------------------------------------------------------------


class TestCallModel:
    def test_call_log_model_creation(self) -> None:
        from app.models.call import CallLog

        log = CallLog(
            type="ivr",
            time="2026-01-01T00:00:00Z",
            fsmContextId="ctx1",
            isCompleted=False,
        )
        assert log.type == "ivr"
        assert log.is_completed is False

    def test_call_log_from_mongo_none(self) -> None:
        from app.models.call import CallLog

        result = CallLog.from_mongo(None)
        assert result is None

    def test_call_sequence_model_from_mongo(self) -> None:
        from bson import ObjectId

        from app.models.call import Call

        doc = {"_id": ObjectId(), "id": 1, "index": 0}
        call = Call.from_mongo(doc)
        assert call.call_id == 1
        assert call.index == 0


# ---------------------------------------------------------------------------
# Platform — lifespan consumers list
# ---------------------------------------------------------------------------


class TestLifespan:
    def test_lifespan_module_importable(self) -> None:
        """The lifespan module should import without errors."""
        import app.platform.lifespan  # noqa: F401


# ---------------------------------------------------------------------------
# Models — system_audio_messages
# ---------------------------------------------------------------------------


class TestSystemAudioMessages:
    def test_system_audio_messages_has_values(self) -> None:
        from app.models.system_audio_messages import SystemAudioMessages

        assert hasattr(SystemAudioMessages, "STUDENT_IS_MUTED")

    def test_all_messages_are_strings(self) -> None:
        from app.models.system_audio_messages import SystemAudioMessages

        for msg in SystemAudioMessages:
            assert isinstance(msg.value, str)


# ---------------------------------------------------------------------------
# FSM state/transition models
# ---------------------------------------------------------------------------


class TestFSMStateTransition:
    def test_state_creation(self) -> None:
        from app.services.fsm.state import State

        state = State(state_id="s0")
        assert state.id == "s0"
        assert state.actions == []

    def test_transition_creation(self) -> None:
        from app.services.fsm.transition import Transition

        t = Transition(
            input="1",
            source_state_id="s0",
            dest_state_id="s1",
        )
        assert t.input == "1"
        assert t.dest_state_id == "s1"

    def test_transition_to_json(self) -> None:
        from app.services.fsm.transition import Transition

        t = Transition(input="2", source_state_id="s0", dest_state_id="s2")
        data = t.to_json()
        assert data["input"] == "2"
        assert data["dest_state_id"] == "s2"
        assert data["source_state_id"] == "s0"

    def test_state_add_transition(self) -> None:
        from app.services.fsm.state import State
        from app.services.fsm.transition import Transition

        state = State(state_id="s0")
        t = Transition(input="1", source_state_id="s0", dest_state_id="s1")
        state.add_transition(t)
        assert "1" in state.transition_map

    def test_state_add_duplicate_transition_raises(self) -> None:
        from app.services.fsm.state import State
        from app.services.fsm.transition import Transition

        state = State(state_id="s0")
        t1 = Transition(input="1", source_state_id="s0", dest_state_id="s1")
        t2 = Transition(input="1", source_state_id="s0", dest_state_id="s2")
        state.add_transition(t1)
        with pytest.raises(ValueError):
            state.add_transition(t2)


# ---------------------------------------------------------------------------
# SAS Service — offline (no Azure calls)
# ---------------------------------------------------------------------------


class TestSASServiceOffline:
    def test_sas_service_azure_disabled_returns_original_url(self) -> None:
        """When Azure is disabled, get_url_with_sas returns the original URL."""
        mock_settings = MagicMock()
        mock_settings.azure_storage_account_name = ""
        mock_settings.azure_storage_account_key = ""
        mock_settings.azure_blob_sas_enabled = False

        with patch("app.services.sas_service.get_settings", return_value=mock_settings):
            from app.services.sas_service import SASService

            # Reset lru_cache so settings are re-read
            svc = SASService.__new__(SASService)
            svc._account_name = ""
            svc._account_key = ""
            svc._sas_expiry_hours = 1
            svc._azure_enabled = False
            svc._use_account_key = False
            svc._credential = None
            svc._blob_service_client = None
            svc._user_delegation_key = None
            svc._key_expiry_time = None

            original_url = "https://example.blob.core.windows.net/container/file.mp3"
            result = svc.get_url_with_sas(original_url)
            assert result == original_url
