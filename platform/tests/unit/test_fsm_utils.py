"""
Tests for FSM instantiation utilities: pause_announcement, duration_announcement,
speed_control, and the SinkConferenceEvent + redis_conference_store + blob_service.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest


# ---------------------------------------------------------------------------
# Pause announcement
# ---------------------------------------------------------------------------


class TestPauseAnnouncement:
    def test_get_pause_instruction_english(self) -> None:
        from app.services.fsm.instantiation.pause_announcement import get_pause_instruction

        result = get_pause_instruction("english")
        assert "zero" in result.lower() or "0" in result

    def test_get_pause_instruction_unknown_language(self) -> None:
        from app.services.fsm.instantiation.pause_announcement import get_pause_instruction

        result = get_pause_instruction("unknown")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_get_paused_announcement(self) -> None:
        from app.services.fsm.instantiation.pause_announcement import get_paused_announcement

        result = get_paused_announcement("english")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_get_resuming_announcement(self) -> None:
        from app.services.fsm.instantiation.pause_announcement import get_resuming_announcement

        result = get_resuming_announcement("english")
        assert isinstance(result, str)

    def test_all_languages_have_pause(self) -> None:
        from app.services.fsm.instantiation.pause_announcement import (
            PAUSE_INSTRUCTIONS,
            get_pause_instruction,
        )

        for lang in PAUSE_INSTRUCTIONS:
            result = get_pause_instruction(lang)
            assert len(result) > 0


# ---------------------------------------------------------------------------
# Duration announcement
# ---------------------------------------------------------------------------


class TestDurationAnnouncement:
    def test_format_minutes_only(self) -> None:
        from app.services.fsm.instantiation.duration_announcement import format_duration_announcement

        result = format_duration_announcement(120.0, "english")
        assert "2" in result
        assert "minutes" in result.lower()

    def test_format_seconds_only(self) -> None:
        from app.services.fsm.instantiation.duration_announcement import format_duration_announcement

        result = format_duration_announcement(45.0, "english")
        assert "45" in result
        assert "seconds" in result.lower()

    def test_format_full(self) -> None:
        from app.services.fsm.instantiation.duration_announcement import format_duration_announcement

        result = format_duration_announcement(90.5, "english")
        assert "1" in result  # 1 minute
        assert "30" in result or "seconds" in result.lower()

    def test_format_none_returns_empty(self) -> None:
        from app.services.fsm.instantiation.duration_announcement import format_duration_announcement

        result = format_duration_announcement(None, "english")
        assert result == ""

    def test_format_zero_returns_empty(self) -> None:
        from app.services.fsm.instantiation.duration_announcement import format_duration_announcement

        result = format_duration_announcement(0.0, "english")
        assert result == ""

    def test_format_kannada(self) -> None:
        from app.services.fsm.instantiation.duration_announcement import format_duration_announcement

        result = format_duration_announcement(60.0, "kannada")
        assert isinstance(result, str)
        assert len(result) > 0

    def test_format_unknown_language_falls_back(self) -> None:
        from app.services.fsm.instantiation.duration_announcement import format_duration_announcement

        result = format_duration_announcement(60.0, "unknown")
        # Falls back to English
        assert "minutes" in result.lower()


# ---------------------------------------------------------------------------
# IVR constants - more coverage
# ---------------------------------------------------------------------------


class TestIVRConstantsExtended:
    def test_language_dialog_urls_are_strings(self) -> None:
        from app.services.fsm.instantiation.ivr_constants import languageDialogUrls

        for lang, url in languageDialogUrls.items():
            assert isinstance(url, str)
            assert len(url) > 0

    def test_get_content_url_has_output_container(self) -> None:
        from app.services.fsm.instantiation.ivr_constants import get_content_url

        url = get_content_url()
        assert "output-container" in url

    def test_speed_instructions_all_languages(self) -> None:
        from app.services.fsm.instantiation.speed_control import (
            _SPEED_ANNOUNCEMENTS,
            get_speed_instruction,
        )

        for lang in _SPEED_ANNOUNCEMENTS:
            result = get_speed_instruction(lang)
            assert len(result) > 0


# ---------------------------------------------------------------------------
# Blob service (mock provider)
# ---------------------------------------------------------------------------


class TestBlobService:
    @pytest.mark.asyncio
    async def test_upload_content_audio(self) -> None:
        from app.services.blob_service import upload_content_audio

        mock_provider = MagicMock()
        mock_provider.upload_file = AsyncMock(return_value="https://example.com/content/1.0.mp3")

        with patch("app.services.blob_service._get_provider", return_value=mock_provider):
            url = await upload_content_audio("content123", b"audio_data")
            assert "content123" in url or "example.com" in url

    @pytest.mark.asyncio
    async def test_get_content_audio_url(self) -> None:
        from app.services.blob_service import get_content_audio_url

        mock_provider = MagicMock()
        mock_provider.generate_sas_url = AsyncMock(return_value="https://example.com/content/1.0.mp3?sas=token")

        with patch("app.services.blob_service._get_provider", return_value=mock_provider):
            url = await get_content_audio_url("content123")
            assert isinstance(url, str)


# ---------------------------------------------------------------------------
# RedisConferenceStore (mock redis)
# ---------------------------------------------------------------------------


class TestRedisConferenceStore:
    def _make_store(self):
        """Create a RedisConferenceStore with a mocked redis client."""
        import redis.asyncio as aioredis
        from app.services.redis_conference_store import RedisConferenceStore

        mock_client = AsyncMock()
        with patch.object(aioredis.Redis, "from_url", return_value=mock_client):
            with patch("redis.asyncio.from_url", return_value=mock_client):
                store = RedisConferenceStore.__new__(RedisConferenceStore)
                store._client = mock_client
                store._ttl = 7200
                return store

    @pytest.mark.asyncio
    async def test_load_nonexistent(self) -> None:
        store = self._make_store()
        store._client.get = AsyncMock(return_value=None)

        result = await store.load("nonexistent")
        assert result is None

    @pytest.mark.asyncio
    async def test_save_state(self) -> None:
        store = self._make_store()
        store._client.set = AsyncMock()
        store._client.sadd = AsyncMock()

        from app.models.conference_state import ConferenceCallState

        state = ConferenceCallState(conference_id="conf1", is_running=True)
        await store.save("conf1", state)
        store._client.set.assert_called_once()

    @pytest.mark.asyncio
    async def test_delete_conference(self) -> None:
        store = self._make_store()
        store._client.delete = AsyncMock()
        store._client.srem = AsyncMock()

        await store.delete("conf1")
        store._client.delete.assert_called_once()

    @pytest.mark.asyncio
    async def test_list_active(self) -> None:
        store = self._make_store()
        store._client.keys = AsyncMock(return_value=["conf:conf1:state", "conf:conf2:state"])

        result = await store.list_active()
        assert len(result) == 2
        assert "conf1" in result
        assert "conf2" in result


# ---------------------------------------------------------------------------
# School service — more coverage
# ---------------------------------------------------------------------------


class TestSchoolServiceExtended:
    @pytest.fixture
    def db(self):
        import mongomock_motor

        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_db_school"]

    @pytest.mark.asyncio
    async def test_list_schools_for_tenant(self, db) -> None:
        from app.services.school_service import SchoolService

        svc = SchoolService(db)
        await svc.create_school(name="School A", email="a@school.com", tenant_id="t1", plain_password="p")
        await svc.create_school(name="School B", email="b@school.com", tenant_id="t1", plain_password="p")
        await svc.create_school(name="School C", email="c@school.com", tenant_id="t2", plain_password="p")

        schools = await svc.list_schools_by_tenant("t1")
        assert len(schools) == 2
        names = {s.name for s in schools}
        assert "School A" in names
        assert "School B" in names

    @pytest.mark.asyncio
    async def test_create_classroom(self, db) -> None:
        from app.models.classroom import ClassroomCreate
        from app.services.school_service import SchoolService

        svc = SchoolService(db)
        data = ClassroomCreate(
            name="Class 1A",
            school_id="s1",
            teacher="teacher1",
        )
        classroom = await svc.create_classroom(data)
        assert classroom.name == "Class 1A"

    @pytest.mark.asyncio
    async def test_get_classrooms_by_school(self, db) -> None:
        from app.models.classroom import ClassroomCreate
        from app.services.school_service import SchoolService

        svc = SchoolService(db)
        c1 = ClassroomCreate(name="Class 1A", school_id="s1", teacher="t1")
        c2 = ClassroomCreate(name="Class 1B", school_id="s1", teacher="t1")
        c3 = ClassroomCreate(name="Class 2A", school_id="s2", teacher="t1")

        await svc.create_classroom(c1)
        await svc.create_classroom(c2)
        await svc.create_classroom(c3)

        classes = await svc.list_classrooms_by_school("s1")
        assert len(classes) == 2


# ---------------------------------------------------------------------------
# User service — more coverage
# ---------------------------------------------------------------------------


class TestUserServiceExtended:
    @pytest.fixture
    def db(self):
        import mongomock_motor

        client = mongomock_motor.AsyncMongoMockClient()
        return client["test_db_user"]

    @pytest.mark.asyncio
    async def test_list_users_by_tenant(self, db) -> None:
        from app.services.auth_service import TeacherCreate, register_teacher
        from app.services.user_service import list_users_by_tenant

        tc1 = TeacherCreate(name="Alice", email="alice@t1.com", password="pass", tenant_id="t1")
        tc2 = TeacherCreate(name="Bob", email="bob@t1.com", password="pass", tenant_id="t1")
        tc3 = TeacherCreate(name="Carol", email="carol@t2.com", password="pass", tenant_id="t2")

        await register_teacher(tc1, db)
        await register_teacher(tc2, db)
        await register_teacher(tc3, db)

        current = {"sub": "u1", "role": "teacher", "tenant_id": "t1"}
        users = await list_users_by_tenant("t1", current, db)
        assert len(users) >= 2

    @pytest.mark.asyncio
    async def test_get_participants_owner(self, db) -> None:
        from app.services.auth_service import TeacherCreate, register_teacher
        from app.services.user_service import get_participants

        tc = TeacherCreate(name="Dave", email="dave@t1.com", password="pass", tenant_id="t1")
        user = await register_teacher(tc, db)

        current = {"sub": str(user.id), "role": "teacher", "tenant_id": "t1"}
        # Insert a conference_state to check ownership
        await db["conference_states"].insert_one({
            "conference_id": "conf1",
            "created_by": str(user.id),
        })
        # Should not raise
        result = await get_participants(
            conference_id="conf1",
            current_user=current,
            db=db,
        )
        assert isinstance(result, list)
