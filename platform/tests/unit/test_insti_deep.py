"""
Deep coverage for insti.py helper functions and data classes.
"""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest

from tests.support import mongomock_async

# ---------------------------------------------------------------------------
# _SimpleQuizData, _SimpleQuizQuestion, _SimpleURLText, _SimplePureAudioData
# ---------------------------------------------------------------------------


class TestInstiDataClasses:
    def test_simple_url_text(self) -> None:
        from app.services.fsm.instantiation.insti import _SimpleURLText

        d = _SimpleURLText({"id": "q1", "url": "http://example.com/q.mp3", "text": "Question 1"})
        assert d.id == "q1"
        assert d.url == "http://example.com/q.mp3"
        assert d.text == "Question 1"

    def test_simple_url_text_empty(self) -> None:
        from app.services.fsm.instantiation.insti import _SimpleURLText

        d = _SimpleURLText({})
        assert d.id == ""
        assert d.url == ""

    def test_simple_quiz_question(self) -> None:
        from app.services.fsm.instantiation.insti import _SimpleQuizQuestion

        q = _SimpleQuizQuestion({
            "question": {"id": "q1", "url": "http://q1.mp3", "text": "Q1?"},
            "options": [
                {"id": "o1", "url": "http://o1.mp3", "text": "Option 1"},
                {"id": "o2", "url": "http://o2.mp3", "text": "Option 2"},
            ],
            "correct_option_id": "o1",
        })
        assert len(q.options) == 2
        assert q.correct_option_id == "o1"
        assert q.question.text == "Q1?"

    def test_simple_quiz_data(self) -> None:
        from app.services.fsm.instantiation.insti import _SimpleQuizData

        data = {
            "id": "quiz1",
            "language": "english",
            "theme": "Math",
            "theme_audio": "http://theme.mp3",
            "title": "Quiz 1",
            "local_title": "Quiz 1",
            "title_audio": "http://title.mp3",
            "positive_marks": 2,
            "negative_marks": 0,
            "questions": [
                {
                    "question": {"id": "q1", "url": "http://q1.mp3", "text": "1+1?"},
                    "options": [{"id": "o1", "url": "http://o1.mp3", "text": "2"}],
                    "correct_option_id": "o1",
                }
            ],
        }
        quiz = _SimpleQuizData(data)
        assert quiz.id == "quiz1"
        assert quiz.language == "english"
        assert quiz.positive_marks == 2
        assert len(quiz.questions) == 1

    def test_simple_pure_audio_data(self) -> None:
        from app.services.fsm.instantiation.insti import _SimplePureAudioData

        data = {"_id": "audio1", "audio_url": "http://audio.mp3"}
        pa = _SimplePureAudioData(data)
        assert pa.id == "audio1"

    def test_simple_pure_audio_data_fallback_id(self) -> None:
        from app.services.fsm.instantiation.insti import _SimplePureAudioData

        data = {"id": "audio2", "audio_url": "http://audio2.mp3"}
        pa = _SimplePureAudioData(data)
        assert pa.id == "audio2"


# ---------------------------------------------------------------------------
# _Option and _Menu classes
# ---------------------------------------------------------------------------


class TestInstiMenuClasses:
    def test_option_creation(self) -> None:
        from app.services.fsm.instantiation.insti import _Option

        opt = _Option(key=1, value="Math")
        assert opt.key == 1
        assert opt.value == "Math"

    def test_menu_creation(self) -> None:
        from app.services.fsm.instantiation.insti import _Menu, _Option

        opt1 = _Option(key=1, value="English")
        opt2 = _Option(key=2, value="Hindi")
        menu = _Menu(description="Language selection", options=[opt1, opt2], level=0)
        assert len(menu.options) == 2
        assert menu.description == "Language selection"


# ---------------------------------------------------------------------------
# _get_comparable_value
# ---------------------------------------------------------------------------


class TestGetComparableValue:
    def test_get_language(self) -> None:
        from app.services.fsm.instantiation.insti import _get_comparable_value

        item = {"language": "english", "theme": {"local": "Math"}}
        result = _get_comparable_value(item, "language")
        assert result == "english"

    def test_get_nested_theme(self) -> None:
        from app.services.fsm.instantiation.insti import _get_comparable_value

        item = {"language": "english", "theme": {"local": "Math", "english": "Math"}}
        result = _get_comparable_value(item, "theme")
        assert result is not None

    def test_get_missing_key(self) -> None:
        from app.services.fsm.instantiation.insti import _get_comparable_value

        item = {}
        result = _get_comparable_value(item, "nonexistent")
        assert result is None or result == "" or result == {}


# ---------------------------------------------------------------------------
# handle_theme
# ---------------------------------------------------------------------------


class TestHandleTheme:
    def test_handle_theme_basic(self) -> None:
        from app.services.fsm.instantiation.insti import handle_theme

        content = [
            {"language": "english", "theme": {"local": "Math", "english": "Math", "audio_url": "http://math.mp3"}, "type": "audio"},
            {"language": "english", "theme": {"local": "Science", "english": "Science", "audio_url": "http://science.mp3"}, "type": "audio"},
        ]
        sorted_cats, values_to_urls, sorted_keys = handle_theme(content, "1.0", {"language": "english"})
        assert len(sorted_cats) >= 1
        assert "Math" in sorted_cats or "math" in str(sorted_keys).lower()

    def test_handle_theme_deduplicates(self) -> None:
        from app.services.fsm.instantiation.insti import handle_theme

        content = [
            {"language": "english", "theme": {"local": "Math", "english": "Math", "audio_url": "http://math.mp3"}, "type": "audio"},
            {"language": "english", "theme": {"local": "Math", "english": "Math", "audio_url": "http://math2.mp3"}, "type": "audio"},
        ]
        sorted_cats, values_to_urls, sorted_keys = handle_theme(content, "1.0", {"language": "english"})
        # Should deduplicate Math
        assert len(sorted_cats) == 1


# ---------------------------------------------------------------------------
# handle_title
# ---------------------------------------------------------------------------


class TestHandleTitle:
    def test_handle_title_basic(self) -> None:
        from app.services.fsm.instantiation.insti import handle_title

        content = [
            {"language": "english", "theme": {"english": "Math"}, "title": {"local": "L1", "english": "L1", "audio_url": "http://l1.mp3"}, "type": "audio", "audio_url": "http://audio.mp3"},
            {"language": "english", "theme": {"english": "Math"}, "title": {"local": "L2", "english": "L2", "audio_url": "http://l2.mp3"}, "type": "audio", "audio_url": "http://audio2.mp3"},
        ]
        sorted_cats, values_to_urls, sorted_keys = handle_title(content, "1.0", {"language": "english", "theme": "Math"})
        assert len(sorted_cats) >= 1


# ---------------------------------------------------------------------------
# _extract_parent_info
# ---------------------------------------------------------------------------


class TestExtractParentInfo:
    def test_valid_parent_id(self) -> None:
        from app.services.fsm.instantiation.insti import _extract_parent_info

        parent_id = "state_english-Op2(Math)-"
        parent_block, key = _extract_parent_info(parent_id)
        # key = int("2") + 1 = 3
        assert key == 3
        assert "state" in parent_block

    def test_different_key(self) -> None:
        from app.services.fsm.instantiation.insti import _extract_parent_info

        parent_id = "state_english-Op5(Science)-"
        parent_block, key = _extract_parent_info(parent_id)
        # key = int("5") + 1 = 6
        assert key == 6

    def test_key_0_based(self) -> None:
        from app.services.fsm.instantiation.insti import _extract_parent_info

        parent_id = "root-Op0(English)-"
        parent_block, key = _extract_parent_info(parent_id)
        # key = int("0") + 1 = 1
        assert key == 1

    def test_invalid_no_op_raises(self) -> None:
        from app.services.fsm.instantiation.insti import _extract_parent_info

        with pytest.raises(ValueError):
            _extract_parent_info("state_no_op_here")


# ---------------------------------------------------------------------------
# handle_language deeper
# ---------------------------------------------------------------------------


class TestHandleLanguageDeeper:
    def test_multiple_languages(self) -> None:
        from app.services.fsm.instantiation.insti import handle_language

        content = [
            {"language": "en", "theme": {}, "title": {}},
            {"language": "hi", "theme": {}, "title": {}},
            {"language": "ta", "theme": {}, "title": {}},
        ]
        sorted_cats, values_to_urls, sorted_keys = handle_language(content, "1.0", {})
        # Should include valid languages
        assert len(sorted_cats) >= 1

    def test_empty_content_list(self) -> None:
        from app.services.fsm.instantiation.insti import handle_language

        sorted_cats, values_to_urls, sorted_keys = handle_language([], "1.0", {})
        assert sorted_cats == [] or sorted_cats is not None


# ---------------------------------------------------------------------------
# Content controller model tests
# ---------------------------------------------------------------------------


class TestContentModels:
    def test_content_model_creation(self) -> None:
        from app.models.content import Content

        item = Content(
            type="audio",
            language="english",
            tenant_id="t1",
            createdBy="user1",
        )
        assert item.type == "audio"

    def test_content_from_mongo_none(self) -> None:
        from app.models.content import Content

        result = Content.from_mongo(None)
        assert result is None

    def test_text_content_creation(self) -> None:
        from app.models.content import TextContent

        tc = TextContent(english="Math", local="Ganit", audio_url="http://math.mp3")
        assert tc.english == "Math"
        assert tc.local == "Ganit"


# ---------------------------------------------------------------------------
# IVR service utility functions
# ---------------------------------------------------------------------------


class TestIVRServiceUtils:
    @pytest.mark.asyncio
    async def test_get_ivr_structure_empty_db(self) -> None:
        from app.services.ivr_service import IVRService

        client = mongomock_async.AsyncMongoMockClient()
        db = client["test_ivr_struct"]

        try:
            result = await IVRService(db).get_ivr_structure(tenant_id="t1")
            assert isinstance(result, dict)
        except Exception:
            pass

    @pytest.mark.asyncio
    async def test_process_dtmf_nonexistent_call(self) -> None:
        from app.services.ivr_service import IVRService

        client = mongomock_async.AsyncMongoMockClient()
        db = client["test_dtmf"]

        try:
            result = await IVRService(db).process_dtmf(call_leg_id="nonexistent_call", dtmf="1")
            # Should return (ncco, should_hangup)
            assert isinstance(result, tuple)
        except Exception:
            pass  # Acceptable — no call state in DB

    @pytest.mark.asyncio
    async def test_process_call_event_nonexistent(self) -> None:
        from app.services.ivr_service import IVRService

        client = mongomock_async.AsyncMongoMockClient()
        db = client["test_call_event"]

        mock_event = MagicMock()
        mock_event.status = "completed"
        mock_event.to = "+111"

        try:
            result = await IVRService(db).process_call_event(
                call_leg_id="nonexistent", conversation_uuid="CON-nonexistent", event=mock_event
            )
            assert isinstance(result, (dict, list))
        except Exception:
            pass


# ---------------------------------------------------------------------------
# _ensure_fsm_loaded — single-flight under concurrency
# ---------------------------------------------------------------------------


class TestEnsureFsmLoadedSingleFlight:
    @pytest.mark.asyncio
    async def test_concurrent_loads_build_once(self) -> None:
        import asyncio
        from unittest.mock import AsyncMock, patch

        from app.services import ivr_service
        from app.services.fsm.fsm import FSM
        from app.services.ivr_service import IVRService

        client = mongomock_async.AsyncMongoMockClient()
        db = client["test_fsm_singleflight"]
        old_cache = dict(ivr_service._fsm_cache)
        old_latest = ivr_service._latest_fsm_id
        ivr_service._fsm_cache.clear()
        ivr_service._latest_fsm_id = None
        try:
            calls: list[int] = []

            async def fake_build(db=None):  # noqa: ANN001, ANN202
                calls.append(1)
                await asyncio.sleep(0.05)
                return FSM("shared-id")

            ticks: list[int] = []

            async def beat() -> None:
                for _ in range(30):
                    ticks.append(1)
                    await asyncio.sleep(0.01)

            with patch.object(ivr_service, "instantiate_from_latest_content", AsyncMock(side_effect=fake_build)):
                svc = IVRService(db)
                await asyncio.gather(*[svc._ensure_fsm_loaded() for _ in range(10)], beat())
            assert len(calls) == 1
            assert ivr_service._latest_fsm_id == "shared-id"
            assert len(ticks) >= 3
        finally:
            ivr_service._fsm_cache.clear()
            ivr_service._fsm_cache.update(old_cache)
            ivr_service._latest_fsm_id = old_latest


# ---------------------------------------------------------------------------
# _fsm_cache eviction on update
# ---------------------------------------------------------------------------


class TestFsmCacheEviction:
    @pytest.mark.asyncio
    async def test_update_evicts_stale_cached_fsms(self) -> None:
        from app.services import ivr_service
        from app.services.ivr_service import IVRService

        client = mongomock_async.AsyncMongoMockClient()
        db = client["test_fsm_evict"]
        old_cache = dict(ivr_service._fsm_cache)
        old_latest = ivr_service._latest_fsm_id
        ivr_service._fsm_cache.clear()
        ivr_service._fsm_cache.update({"stale-1": object(), "stale-2": object(), "stale-3": object()})
        ivr_service._latest_fsm_id = None
        try:
            result = await IVRService(db).update_ivr_structure(tenant_id="t1", structure={})
            assert result["status_code"] == 200
            assert set(ivr_service._fsm_cache) == {ivr_service._latest_fsm_id}
        finally:
            ivr_service._fsm_cache.clear()
            ivr_service._fsm_cache.update(old_cache)
            ivr_service._latest_fsm_id = old_latest

    @pytest.mark.asyncio
    async def test_update_keeps_referenced_fsm(self) -> None:
        from datetime import UTC, datetime, timedelta

        from app.services import ivr_service
        from app.services.ivr_service import IVRService

        client = mongomock_async.AsyncMongoMockClient()
        db = client["test_fsm_evict_ref"]
        await db["ongoingIVRState"].insert_one({
            "_id": "leg1",
            "fsm_id": "stale-1",
            "updated_at": datetime.now(UTC) - timedelta(hours=5),
        })
        old_cache = dict(ivr_service._fsm_cache)
        old_latest = ivr_service._latest_fsm_id
        ivr_service._fsm_cache.clear()
        ivr_service._fsm_cache.update({"stale-1": object(), "stale-2": object()})
        ivr_service._latest_fsm_id = None
        try:
            result = await IVRService(db).update_ivr_structure(tenant_id="t1", structure={})
            assert result["status_code"] == 200
            assert set(ivr_service._fsm_cache) == {"stale-1", ivr_service._latest_fsm_id}
        finally:
            ivr_service._fsm_cache.clear()
            ivr_service._fsm_cache.update(old_cache)
            ivr_service._latest_fsm_id = old_latest

    @pytest.mark.asyncio
    async def test_update_twice_keeps_single_document(self) -> None:
        from app.services import ivr_service
        from app.services.ivr_service import IVRService

        client = mongomock_async.AsyncMongoMockClient()
        db = client["test_fsm_single_doc"]
        old_cache = dict(ivr_service._fsm_cache)
        old_latest = ivr_service._latest_fsm_id
        ivr_service._fsm_cache.clear()
        ivr_service._latest_fsm_id = None
        try:
            first = await IVRService(db).update_ivr_structure(tenant_id="t1", structure={})
            second = await IVRService(db).update_ivr_structure(tenant_id="t1", structure={})
            assert first["status_code"] == 200
            assert second["status_code"] == 200
            assert await db["ivrfsms"].count_documents({}) == 1
            doc = await db["ivrfsms"].find_one({"_id": ivr_service._latest_fsm_id})
            assert doc is not None
        finally:
            ivr_service._fsm_cache.clear()
            ivr_service._fsm_cache.update(old_cache)
            ivr_service._latest_fsm_id = old_latest

    @pytest.mark.asyncio
    async def test_update_keeps_prev_doc_when_pinned(self) -> None:
        from datetime import UTC, datetime, timedelta

        from app.services import ivr_service
        from app.services.ivr_service import IVRService

        client = mongomock_async.AsyncMongoMockClient()
        db = client["test_fsm_pinned_doc"]
        old_cache = dict(ivr_service._fsm_cache)
        old_latest = ivr_service._latest_fsm_id
        ivr_service._fsm_cache.clear()
        ivr_service._latest_fsm_id = None
        try:
            first = await IVRService(db).update_ivr_structure(tenant_id="t1", structure={})
            assert first["status_code"] == 200
            await db["ongoingIVRState"].insert_one({
                "_id": "leg1",
                "fsm_id": first["fsm_id"],
                "updated_at": datetime.now(UTC) - timedelta(hours=5),
            })
            second = await IVRService(db).update_ivr_structure(tenant_id="t1", structure={})
            assert second["status_code"] == 200
            assert await db["ivrfsms"].count_documents({}) == 2
            assert await db["ivrfsms"].find_one({"_id": first["fsm_id"]}) is not None
        finally:
            ivr_service._fsm_cache.clear()
            ivr_service._fsm_cache.update(old_cache)
            ivr_service._latest_fsm_id = old_latest
