"""
Extended unit tests for models, repositories, and platform utilities.

Covers: audit_log, webhook_event, ws_service_message, quiz, ivr_state,
        audit_repository, ivr_repository, comprehension_repository,
        hashing, error_handling, auth native_provider, base_consumer.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Models — audit_log
# ---------------------------------------------------------------------------


class TestAuditLogModel:
    def test_audit_log_from_mongo(self) -> None:
        from bson import ObjectId

        from app.models.audit_log import AuditLog

        oid = ObjectId()
        doc = {
            "_id": oid,
            "user": "teacher1",
            "logText": "login",
            "time": "10:00",
            "priority": 1,
        }
        log = AuditLog.from_mongo(doc)
        assert log.user == "teacher1"
        assert log.log_text == "login"
        assert isinstance(log.id, str)

    def test_audit_log_from_mongo_none(self) -> None:
        from app.models.audit_log import AuditLog

        result = AuditLog.from_mongo(None)
        assert result is None

    def test_log_entry_from_mongo(self) -> None:
        from bson import ObjectId

        from app.models.audit_log import LogEntry

        oid = ObjectId()
        doc = {"_id": oid, "path": "/test", "method": "GET", "statusCode": 200}
        entry = LogEntry.from_mongo(doc)
        assert entry.path == "/test"
        assert entry.status_code == 200
        assert isinstance(entry.id, str)

    def test_ivr_v2_log_from_mongo(self) -> None:
        from bson import ObjectId

        from app.models.audit_log import IvrV2Log

        oid = ObjectId()
        doc = {
            "_id": oid,
            "phone_number": "+1234567890",
            "fsm_id": "fsm1",
            "current_state_id": "s0",
            "created_at": "2026-01-01T00:00:00Z",
            "duration": "30",
            "tenant_id": "t1",
        }
        log = IvrV2Log.from_mongo(doc)
        assert log.phone_number == "+1234567890"
        assert log.tenant_id == "t1"

    def test_user_action_log(self) -> None:
        from app.models.audit_log import UserActionLog

        log = UserActionLog(action_type="keypress", details={"key": "1"})
        assert log.action_type == "keypress"

    def test_stream_playback_log(self) -> None:
        from app.models.audit_log import StreamPlaybackLog

        log = StreamPlaybackLog(stream_id="s1", duration=30.5)
        assert log.duration == 30.5


# ---------------------------------------------------------------------------
# Models — webhook_event
# ---------------------------------------------------------------------------


class TestWebhookEventModel:
    def test_webhook_event_valid(self) -> None:
        from app.models.webhook_event import EventType, WebHookEvent

        evt = WebHookEvent(
            conference_id="conf1",
            event_type=EventType.PARTICIPANT_STATUS,
            data={"status": "joined"},
        )
        assert evt.conference_id == "conf1"
        assert evt.event_type == "participant_status"

    def test_webhook_event_with_participant_phone(self) -> None:
        from app.models.webhook_event import EventType, WebHookEvent

        evt = WebHookEvent(
            conference_id="conf1",
            event_type=EventType.DTMF_INPUT,
            participant_phone="+91234",
            data={"digit": "5"},
        )
        assert evt.participant_phone == "+91234"

    def test_all_event_types(self) -> None:
        from app.models.webhook_event import EventType

        types = [EventType.PARTICIPANT_STATUS, EventType.DTMF_INPUT,
                 EventType.AUDIO_PLAYBACK, EventType.MUTE_UNMUTE]
        assert len(types) == 4


# ---------------------------------------------------------------------------
# Models — ws_service_message
# ---------------------------------------------------------------------------


class TestWSServiceMessage:
    def test_message_type_values(self) -> None:
        from app.models.ws_service_message import MessageType

        assert MessageType.HEARTBEAT == "ping"
        assert MessageType.PLAY_AUDIO == "play"
        assert MessageType.PAUSE_AUDIO == "pause"
        assert MessageType.DISCONNECT == "disconnect"

    def test_websocket_service_message(self) -> None:
        from app.models.ws_service_message import MessageType, WebsocketServiceMessage

        msg = WebsocketServiceMessage(
            websocket_id="ws1",
            type=MessageType.PLAY_AUDIO,
            message="http://example.com/audio.wav",
        )
        assert msg.websocket_id == "ws1"
        assert msg.type == MessageType.PLAY_AUDIO

    def test_websocket_service_message_with_position(self) -> None:
        from app.models.ws_service_message import MessageType, WebsocketServiceMessage

        msg = WebsocketServiceMessage(
            websocket_id="ws1",
            type=MessageType.SEEK_AUDIO,
            position_seconds=30.5,
        )
        assert msg.position_seconds == 30.5

    def test_websocket_service_message_speed_clamp(self) -> None:
        from app.models.ws_service_message import MessageType, WebsocketServiceMessage
        import pydantic

        with pytest.raises(pydantic.ValidationError):
            WebsocketServiceMessage(
                websocket_id="ws1",
                type=MessageType.SET_SPEED,
                speed=0.1,  # below min 0.5
            )


# ---------------------------------------------------------------------------
# Models — IVR state
# ---------------------------------------------------------------------------


class TestIVRStateModel:
    def test_ivr_call_status_end_statuses(self) -> None:
        from app.models.ivr_state import IVRCallStatus

        ends = IVRCallStatus.end_statuses()
        assert IVRCallStatus.COMPLETED in ends
        assert IVRCallStatus.FAILED in ends
        assert IVRCallStatus.DISCONNECTED in ends
        # ANSWERED should NOT be an end status
        assert IVRCallStatus.ANSWERED not in ends

    def test_ivr_call_status_enum_values(self) -> None:
        from app.models.ivr_state import IVRCallStatus

        assert IVRCallStatus.STARTED == "started"
        assert IVRCallStatus.RINGING == "ringing"


# ---------------------------------------------------------------------------
# Platform — hashing
# ---------------------------------------------------------------------------


class TestHashing:
    def test_hash_password_returns_string(self) -> None:
        from app.platform.auth.hashing import hash_password

        h = hash_password("mypassword")
        assert isinstance(h, str)
        assert h.startswith("$2b$")

    def test_verify_password_correct(self) -> None:
        from app.platform.auth.hashing import hash_password, verify_password

        plain = "mypassword123"
        h = hash_password(plain)
        assert verify_password(plain, h) is True

    def test_verify_password_wrong(self) -> None:
        from app.platform.auth.hashing import hash_password, verify_password

        h = hash_password("correct")
        assert verify_password("wrong", h) is False

    def test_hash_is_non_deterministic(self) -> None:
        from app.platform.auth.hashing import hash_password

        h1 = hash_password("same")
        h2 = hash_password("same")
        # Different salts → different hashes
        assert h1 != h2


# ---------------------------------------------------------------------------
# Platform — error_handling
# ---------------------------------------------------------------------------


class TestErrorHandling:
    def test_not_found_error(self) -> None:
        from app.platform.error_handling import NotFoundError

        err = NotFoundError("User", "u123")
        assert err.status_code == 404
        assert "not found" in err.message.lower()

    def test_unauthorized_error(self) -> None:
        from app.platform.error_handling import UnauthorizedError

        err = UnauthorizedError("Invalid token")
        assert err.status_code == 401
        assert "Invalid token" in str(err)

    def test_forbidden_error(self) -> None:
        from app.platform.error_handling import ForbiddenError

        err = ForbiddenError("Access denied")
        assert err.status_code == 403

    def test_conflict_error(self) -> None:
        from app.platform.error_handling import ConflictError

        err = ConflictError("Email already exists")
        assert err.status_code == 409

    def test_validation_error(self) -> None:
        from app.platform.error_handling import ValidationError

        err = ValidationError("Bad field")
        assert err.status_code == 422

    def test_app_error_base(self) -> None:
        from app.platform.error_handling import AppError

        err = AppError(code="TEST", message="test message", status_code=400)
        assert err.code == "TEST"
        assert err.details is None


# ---------------------------------------------------------------------------
# Platform — auth native_provider
# ---------------------------------------------------------------------------


class TestNativeAuthProvider:
    @pytest.mark.asyncio
    async def test_get_user_by_credentials_not_found(self) -> None:
        from app.platform.auth.providers.native_provider import get_user_by_credentials

        db = MagicMock()
        db.__getitem__ = MagicMock(return_value=MagicMock(
            find_one=AsyncMock(return_value=None)
        ))
        result = await get_user_by_credentials("nobody@example.com", "pass", db)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_user_by_credentials_wrong_password(self) -> None:
        from app.platform.auth.providers.native_provider import get_user_by_credentials
        from app.platform.auth.hashing import hash_password

        hashed = hash_password("correctpass")
        user_doc = {"_id": "uid1", "email": "x@y.com", "hashed_password": hashed}

        db = MagicMock()
        db.__getitem__ = MagicMock(return_value=MagicMock(
            find_one=AsyncMock(return_value=user_doc)
        ))
        result = await get_user_by_credentials("x@y.com", "wrongpass", db)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_user_by_credentials_success(self) -> None:
        from app.platform.auth.providers.native_provider import get_user_by_credentials
        from app.platform.auth.hashing import hash_password

        hashed = hash_password("correctpass")
        user_doc = {"_id": "uid1", "email": "x@y.com", "hashed_password": hashed, "name": "Alice"}

        db = MagicMock()
        db.__getitem__ = MagicMock(return_value=MagicMock(
            find_one=AsyncMock(return_value=user_doc)
        ))
        result = await get_user_by_credentials("x@y.com", "correctpass", db)
        assert result is not None
        assert result.get("email") == "x@y.com"
        # hashed_password must NOT be in result
        assert "hashed_password" not in result

    @pytest.mark.asyncio
    async def test_get_user_by_id_invalid(self) -> None:
        from app.platform.auth.providers.native_provider import get_user_by_id

        db = MagicMock()
        result = await get_user_by_id("not-an-objectid", db)
        assert result is None

    @pytest.mark.asyncio
    async def test_get_user_by_id_not_found(self) -> None:
        from bson import ObjectId

        from app.platform.auth.providers.native_provider import get_user_by_id

        db = MagicMock()
        db.__getitem__ = MagicMock(return_value=MagicMock(
            find_one=AsyncMock(return_value=None)
        ))
        result = await get_user_by_id(str(ObjectId()), db)
        assert result is None


# ---------------------------------------------------------------------------
# BaseConsumer — retry / dead-letter logic
# ---------------------------------------------------------------------------


class TestBaseConsumer:
    @pytest.mark.asyncio
    async def test_safe_process_success(self) -> None:
        from app.consumers.base_consumer import BaseConsumer

        class GoodConsumer(BaseConsumer):
            name = "good"
            calls = 0

            async def process(self, message: Any) -> None:
                GoodConsumer.calls += 1

        consumer = GoodConsumer()
        await consumer._safe_process("msg")
        assert GoodConsumer.calls == 1

    @pytest.mark.asyncio
    async def test_safe_process_permanent_error_dead_letters(self) -> None:
        from app.consumers.base_consumer import BaseConsumer, PermanentError

        dead_lettered = []

        class BadConsumer(BaseConsumer):
            name = "bad"

            async def process(self, message: Any) -> None:
                raise PermanentError("corrupt message")

            async def _dead_letter(self, message: Any, reason: str) -> None:
                dead_lettered.append((message, reason))

        consumer = BadConsumer()
        await consumer._safe_process("msg")
        assert len(dead_lettered) == 1
        assert "corrupt" in dead_lettered[0][1]

    @pytest.mark.asyncio
    async def test_safe_process_transient_retries_then_dead_letters(self) -> None:
        """Transient errors retry MAX_TRANSIENT_RETRIES times then dead-letter."""
        from app.consumers.base_consumer import BaseConsumer, MAX_TRANSIENT_RETRIES

        attempts = []
        dead_lettered = []

        class TransientConsumer(BaseConsumer):
            name = "transient"

            async def process(self, message: Any) -> None:
                attempts.append(1)
                raise ConnectionError("network down")

            async def _dead_letter(self, message: Any, reason: str) -> None:
                dead_lettered.append(reason)

        consumer = TransientConsumer()
        # Patch sleep to avoid waiting
        with patch("app.consumers.base_consumer.asyncio.sleep", new_callable=AsyncMock):
            await consumer._safe_process("msg")

        assert len(attempts) == MAX_TRANSIENT_RETRIES
        assert len(dead_lettered) == 1

    @pytest.mark.asyncio
    async def test_safe_process_cancelled_error_propagates(self) -> None:
        from app.consumers.base_consumer import BaseConsumer

        class CancelConsumer(BaseConsumer):
            name = "cancel"

            async def process(self, message: Any) -> None:
                raise asyncio.CancelledError()

        consumer = CancelConsumer()
        with pytest.raises(asyncio.CancelledError):
            await consumer._safe_process("msg")


# ---------------------------------------------------------------------------
# Repositories — audit_repository (with mongomock-motor)
# ---------------------------------------------------------------------------


class TestAuditRepository:
    @pytest.fixture
    def db(self):
        import mongomock_motor

        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_db"]

    @pytest.mark.asyncio
    async def test_create_and_find_log(self, db) -> None:
        from app.models.audit_log import AuditLog
        from app.repositories.audit_repository import AuditRepository

        repo = AuditRepository(db)
        log = AuditLog(
            user="teacher1",
            log_text="test action",
            time="12:00",
            priority=1,
            tenant_id="t1",
        )
        created = await repo.create_log(log)
        assert created.id is not None
        assert created.user == "teacher1"

        results = await repo.find_recent_by_tenant("t1")
        assert len(results) == 1
        assert results[0].user == "teacher1"

    @pytest.mark.asyncio
    async def test_create_log_entry(self, db) -> None:
        from app.models.audit_log import LogEntry
        from app.repositories.audit_repository import AuditRepository

        repo = AuditRepository(db)
        entry = LogEntry(path="/api/test", method="GET", status_code=200)
        created = await repo.create_log_entry(entry)
        assert created.path == "/api/test"

    @pytest.mark.asyncio
    async def test_find_logs_by_user_and_tenant(self, db) -> None:
        from app.models.audit_log import AuditLog
        from app.repositories.audit_repository import AuditRepository

        repo = AuditRepository(db)
        log = AuditLog(user="u1", log_text="did something", time="09:00", priority=2, tenant_id="t1")
        await repo.create_log(log)

        results = await repo.find_logs_by_user_and_tenant("u1", "t1")
        assert len(results) == 1

        # different tenant returns nothing
        cross = await repo.find_logs_by_user_and_tenant("u1", "t_other")
        assert len(cross) == 0


# ---------------------------------------------------------------------------
# Repositories — ivr_repository
# ---------------------------------------------------------------------------


class TestIVRRepository:
    @pytest.fixture
    def db(self):
        import mongomock_motor

        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_db"]

    @pytest.mark.asyncio
    async def test_save_and_find_fsm(self, db) -> None:
        from app.models.ivr_state import IVRfsmDoc
        from app.repositories.ivr_repository import IVRRepository

        repo = IVRRepository(db)
        import time

        fsm = IVRfsmDoc(
            states=[{"id": "s0", "name": "root"}],
            transitions=[],
            created_at=int(time.time() * 1000),
            init_state_id="s0",
        )
        saved = await repo.save_fsm(fsm)
        assert saved.init_state_id == "s0"
        assert saved.states[0]["id"] == "s0"

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
        await repo.log_ivr_event("call123", {"status": "answered", "ts": "now"})
        # No exception = success

    @pytest.mark.asyncio
    async def test_find_fsm_context_not_found(self, db) -> None:
        from app.repositories.ivr_repository import IVRRepository

        repo = IVRRepository(db)
        result = await repo.find_fsm_context("nonexistent_call")
        assert result is None


# ---------------------------------------------------------------------------
# Repositories — comprehension_repository
# ---------------------------------------------------------------------------


class TestComprehensionRepository:
    @pytest.fixture
    def db(self):
        import mongomock_motor

        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_db"]

    @pytest.mark.asyncio
    async def test_create_and_find(self, db) -> None:
        from app.repositories.comprehension_repository import ComprehensionRepository

        repo = ComprehensionRepository(db)
        doc = {
            "phone_number": "+910000001",
            "fsm_id": "fsm1",
            "state_id": "s0",
            "tenant_id": "t1",
            "score": 80,
        }
        inserted_id = await repo.create_comprehension(doc)
        assert inserted_id is not None

        found = await repo.get_comprehension_by_id(inserted_id)
        assert found is not None
        assert found.get("phone_number") == "+910000001"

    @pytest.mark.asyncio
    async def test_get_all_comprehensions(self, db) -> None:
        from app.repositories.comprehension_repository import ComprehensionRepository

        repo = ComprehensionRepository(db)
        await repo.create_comprehension({"name": "comp1"})
        await repo.create_comprehension({"name": "comp2"})

        all_docs = await repo.get_all_comprehensions()
        assert len(all_docs) == 2

    @pytest.mark.asyncio
    async def test_delete_comprehension(self, db) -> None:
        from app.repositories.comprehension_repository import ComprehensionRepository

        repo = ComprehensionRepository(db)
        inserted_id = await repo.create_comprehension({"name": "to_delete"})
        deleted = await repo.delete_comprehension(inserted_id)
        assert deleted is True

        found = await repo.get_comprehension_by_id(inserted_id)
        assert found is None


# ---------------------------------------------------------------------------
# Content job consumer — utility functions
# ---------------------------------------------------------------------------


class TestContentJobConsumerUtils:
    def test_validate_temp_path_valid(self) -> None:
        import tempfile

        from app.consumers.content_job_consumer import _validate_temp_path

        tmpdir = tempfile.gettempdir()
        _validate_temp_path(tmpdir + "/test_file.mp3")  # Should not raise

    def test_validate_temp_path_invalid(self) -> None:
        from app.consumers.content_job_consumer import _validate_temp_path

        with pytest.raises(ValueError, match="Security violation"):
            _validate_temp_path("/etc/passwd")

    def test_make_temp_input_path(self) -> None:
        import os
        import tempfile

        from app.consumers.content_job_consumer import _make_temp_input_path

        path = _make_temp_input_path("content123")
        try:
            assert os.path.exists(path)
            assert "content123" in path
            assert path.startswith(tempfile.gettempdir())
        finally:
            if os.path.exists(path):
                os.unlink(path)

    def test_parse_blob_url_valid(self) -> None:
        from app.consumers.content_job_consumer import _parse_blob_url_simple

        container, blob_path = _parse_blob_url_simple(
            "https://account.blob.core.windows.net/mycontainer/audio/file.mp3"
        )
        assert container == "mycontainer"
        assert blob_path == "audio/file.mp3"

    def test_parse_blob_url_invalid(self) -> None:
        from app.consumers.content_job_consumer import _parse_blob_url_simple

        with pytest.raises(ValueError):
            _parse_blob_url_simple("https://example.com/single")

    def test_cleanup_temp_files_nonexistent(self) -> None:
        from app.consumers.content_job_consumer import _cleanup_temp_files

        # Should not raise even for nonexistent paths
        _cleanup_temp_files("/tmp/nonexistent_xyz_12345.wav")


# ---------------------------------------------------------------------------
# Content job consumer — dead-letter on failure
# ---------------------------------------------------------------------------


class TestContentJobConsumerDeadLetter:
    @pytest.fixture
    def db(self):
        import mongomock_motor

        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_db"]

    @pytest.mark.asyncio
    async def test_permanent_error_marks_job_failed(self, db) -> None:
        from bson import ObjectId

        from app.consumers.content_job_consumer import _process_audio_content_job
        from app.repositories.content_job_repository import ContentJobRepository
        from app.repositories.content_repository import ContentRepository

        job_id = ObjectId()
        job_doc = {"_id": job_id, "content_id": "c1", "status": "claimed"}
        await db["content_jobs"].insert_one(job_doc)

        # content_col returns None => RuntimeError (permanent)
        blob_mock = MagicMock()
        with pytest.raises(RuntimeError):
            await _process_audio_content_job(job_doc, ContentJobRepository(db), ContentRepository(db), blob_mock)

        updated = await db["content_jobs"].find_one({"_id": job_id})
        assert updated["status"] == "failed"
        assert "Content document not found" in updated["reason"]


# ---------------------------------------------------------------------------
# School service
# ---------------------------------------------------------------------------


class TestSchoolService:
    @pytest.fixture
    def db(self):
        import mongomock_motor

        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_db"]

    @pytest.mark.asyncio
    async def test_create_school_success(self, db) -> None:
        from app.services.school_service import SchoolService

        school = await SchoolService(db).create_school(
            name="Test School",
            email="school@test.com",
            tenant_id="t1",
            plain_password="secret123",
        )
        assert school.name == "Test School"
        assert school.email == "school@test.com"

    @pytest.mark.asyncio
    async def test_create_school_conflict(self, db) -> None:
        from app.platform.error_handling import ConflictError
        from app.services.school_service import SchoolService

        svc = SchoolService(db)
        await svc.create_school(name="Dup School", email="dup@test.com", tenant_id="t1", plain_password="pass")

        with pytest.raises(ConflictError):
            await svc.create_school(name="Dup School", email="dup@test.com", tenant_id="t1", plain_password="pass")

    @pytest.mark.asyncio
    async def test_get_school_not_found(self, db) -> None:
        from app.platform.error_handling import NotFoundError
        from app.services.school_service import SchoolService

        with pytest.raises(NotFoundError):
            await SchoolService(db).get_school("nonexistent123456789012", "tenant-x")

    @pytest.mark.asyncio
    async def test_create_school_with_password(self, db) -> None:
        from app.services.school_service import SchoolService

        school = await SchoolService(db).create_school(
            name="Pwd School",
            email="pwd@test.com",
            tenant_id="t1",
            plain_password="secret123",
        )
        assert school.name == "Pwd School"


# ---------------------------------------------------------------------------
# User service
# ---------------------------------------------------------------------------


class TestUserService:
    @pytest.fixture
    def db(self):
        import mongomock_motor

        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_db"]

    @pytest.mark.asyncio
    async def test_get_user_not_found(self, db) -> None:
        from app.platform.error_handling import NotFoundError
        from app.services.user_service import get_user

        current = {"sub": "u1", "role": "teacher", "tenant_id": "t1"}
        with pytest.raises(NotFoundError):
            await get_user("nonexistent12345678901", current, db)


# ---------------------------------------------------------------------------
# Auth service — register + login
# ---------------------------------------------------------------------------


class TestAuthService:
    @pytest.fixture
    def db(self):
        import mongomock_motor

        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_db"]

    @pytest.mark.asyncio
    async def test_register_teacher_success(self, db) -> None:
        from app.services.auth_service import TeacherCreate, register_teacher

        tc = TeacherCreate(
            name="Bob",
            email="bob@example.com",
            password="pass123",
            tenant_id="t1",
        )
        user = await register_teacher(tc, db)
        assert user.email == "bob@example.com"
        assert user.role.value == "teacher"

    @pytest.mark.asyncio
    async def test_register_teacher_duplicate(self, db) -> None:
        from app.platform.error_handling import ConflictError
        from app.services.auth_service import TeacherCreate, register_teacher

        tc = TeacherCreate(name="Bob2", email="bob2@example.com", password="pass123")
        await register_teacher(tc, db)

        with pytest.raises(ConflictError):
            await register_teacher(tc, db)

    @pytest.mark.asyncio
    async def test_login_native_success(self, db) -> None:
        from app.services.auth_service import TenantCreate, login, register_tenant

        tc = TenantCreate(name="Carol", email="carol@example.com", password="mypassword")
        await register_tenant(tc, db)

        result = await login("carol@example.com", "mypassword", "native", db)
        assert "token" in result
        assert result["user"]["email"] == "carol@example.com"
        # password must not be in response
        assert "hashed_password" not in result["user"]

    @pytest.mark.asyncio
    async def test_login_native_wrong_password(self, db) -> None:
        from app.platform.error_handling import UnauthorizedError
        from app.services.auth_service import TeacherCreate, login, register_teacher

        tc = TeacherCreate(name="Dave", email="dave@example.com", password="rightpass")
        await register_teacher(tc, db)

        with pytest.raises(UnauthorizedError):
            await login("dave@example.com", "wrongpass", "native", db)

    @pytest.mark.asyncio
    async def test_login_native_unknown_user(self, db) -> None:
        from app.platform.error_handling import UnauthorizedError
        from app.services.auth_service import login

        with pytest.raises(UnauthorizedError):
            await login("nobody@example.com", "pass", "native", db)
