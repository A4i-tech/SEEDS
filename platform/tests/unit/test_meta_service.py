"""
Unit tests for meta_service (Seeds AI controller — reason/plan/execute/summarize pipeline).

Uses mongomock-motor for DB reads and mocks/patches for Azure OpenAI, Azure Speech,
aiohttp, and ffmpeg — no real network calls or external services are touched.
"""

from __future__ import annotations

import os
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import aiohttp
import pytest
from bson import ObjectId
from mongomock_motor import AsyncMongoMockClient

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only")
os.environ.setdefault("AUTH_TYPE", "jwt")
os.environ.setdefault("JWT_EXPIRES_IN", "1d")

from app.services import meta_service  # noqa: E402

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


@pytest.fixture
def user_info() -> dict[str, Any]:
    return {
        "user_id": "teacher1",
        "tenant_id": "tenant1",
        "school_id": "school1",
        "phone_number": "+10000000000",
        "name": "Teacher",
        "active_conference_id": "none",
        "current_class_id": "none",
        "history": [],
    }


# ---------------------------------------------------------------------------
# _extract_keywords
# ---------------------------------------------------------------------------


class TestExtractKeywords:
    def test_strips_stop_words_and_punctuation(self) -> None:
        assert meta_service._extract_keywords("Play the Keats poem please!") == ["keats", "poem"]

    def test_empty_transcript_returns_no_keywords(self) -> None:
        assert meta_service._extract_keywords("") == []


# ---------------------------------------------------------------------------
# fetch_context_from_db
# ---------------------------------------------------------------------------


class TestFetchContextFromDb:
    @pytest.mark.asyncio
    async def test_no_keywords_returns_empty_context(self, mock_db) -> None:
        result = await meta_service.fetch_context_from_db("the a an", "teacher1", "school1", "tenant-1", mock_db)
        assert result == {"content": [], "classes": [], "students": []}

    @pytest.mark.asyncio
    async def test_matches_content_by_title(self, mock_db) -> None:
        await mock_db["contentsV3"].insert_one(
            {
                "title": {"english": "Keats Poem"}, "type": "poem", "language": "en", "theme": {},
                "tenant_id": "tenant-1", "school_id": "school1",
            }
        )
        result = await meta_service.fetch_context_from_db("play keats poem", "teacher1", "school1", "tenant-1", mock_db)
        assert len(result["content"]) == 1
        assert result["content"][0]["title"] == "Keats Poem"

    @pytest.mark.asyncio
    async def test_populates_students_for_teachers_classes(self, mock_db) -> None:
        student_id = ObjectId()
        await mock_db["users"].insert_one(
            {"_id": student_id, "name": "Punit", "phone": "+11111", "school_id": "school1", "role": "student"}
        )
        await mock_db["classes"].insert_one(
            {"teacher": "teacher1", "name": "Class A", "students": [student_id], "leaders": []}
        )
        result = await meta_service.fetch_context_from_db("class alpha", "teacher1", "school1", "tenant-1", mock_db)
        assert len(result["classes"]) == 1
        assert result["classes"][0]["students"] == [{"name": "Punit", "phone": "+11111"}]

    @pytest.mark.asyncio
    async def test_missing_student_ref_is_dropped_not_phantom(self, mock_db) -> None:
        """Regression: a student ref with no matching user doc must be filtered out,
        not surfaced to the LLM as a blank {name: "", phone: ""} entry."""
        missing_id = ObjectId()
        await mock_db["classes"].insert_one(
            {"teacher": "teacher1", "name": "Class A", "students": [missing_id], "leaders": []}
        )
        result = await meta_service.fetch_context_from_db("class alpha", "teacher1", "school1", "tenant-1", mock_db)
        assert result["classes"][0]["students"] == []

    @pytest.mark.asyncio
    async def test_empty_school_id_skips_student_query_entirely(self, mock_db) -> None:
        """Regression: an empty school_id must never reach Mongo as {"school_id": ""} —
        it should short-circuit to no student query instead of a cross-tenant-shaped filter."""
        await mock_db["users"].insert_one(
            {"name": "Someone", "phone": "+1", "school_id": "", "role": "student"}
        )
        result = await meta_service.fetch_context_from_db("find student", "teacher1", "", "tenant-1", mock_db)
        assert result["students"] == []


# ---------------------------------------------------------------------------
# _format_db_context / _format_history / _build_prompt
# ---------------------------------------------------------------------------


class TestFormatting:
    def test_format_db_context_empty(self) -> None:
        out = meta_service._format_db_context({"content": [], "classes": [], "students": []})
        assert out == "(no matching data found in database)"

    def test_format_db_context_includes_sections(self) -> None:
        db_results = {
            "content": [{"_id": "1", "title": "T", "type": "poem", "language": "en", "theme": ""}],
            "classes": [],
            "students": [],
        }
        out = meta_service._format_db_context(db_results)
        assert "MATCHING CONTENT FROM DATABASE" in out
        assert '"1"' in out

    def test_format_history_none_returns_placeholder(self) -> None:
        assert "none — this is the first command" in meta_service._format_history(None)

    def test_format_history_keeps_last_two_only(self) -> None:
        history = [
            {"transcript": "one", "spokenSummary": "r1"},
            {"transcript": "two", "spokenSummary": "r2"},
            {"transcript": "three", "spokenSummary": "r3"},
        ]
        out = meta_service._format_history(history)
        assert "one" not in out
        assert "two" in out
        assert "three" in out

    def test_build_prompt_replaces_all_placeholders(self, user_info) -> None:
        template = "phone={{phoneNumber}} name={{teacherName}} extra={{dbContext}}"
        out = meta_service._build_prompt(template, user_info, {"dbContext": "CTX"})
        assert out == "phone=+10000000000 name=Teacher extra=CTX"


# ---------------------------------------------------------------------------
# _call_llm
# ---------------------------------------------------------------------------


class TestCallLlm:
    @pytest.fixture(autouse=True)
    def _reset_llm_client_singleton(self) -> None:
        """Each test must construct its own mock client rather than reusing a
        cached singleton from a previous test."""
        meta_service._llm_client = None
        yield
        meta_service._llm_client = None

    @pytest.mark.asyncio
    async def test_raises_if_azure_openai_not_configured(self) -> None:
        with patch("app.services.meta_service.get_settings") as mock_settings:
            mock_settings.return_value = MagicMock(azure_openai_key="", azure_openai_endpoint="")
            with pytest.raises(RuntimeError, match="Azure OpenAI not configured"):
                await meta_service._call_llm("system", "user")

    @pytest.mark.asyncio
    async def test_returns_parsed_json_on_success(self) -> None:
        fake_settings = MagicMock(
            azure_openai_key="key", azure_openai_endpoint="https://x.example",
            azure_openai_model="gpt-4.1-mini", azure_openai_api_version="v1",
        )
        fake_resp = MagicMock()
        fake_resp.choices = [MagicMock(message=MagicMock(content='{"intent": "play"}'))]
        fake_client = MagicMock()
        fake_client.chat.completions.create = AsyncMock(return_value=fake_resp)

        with patch("app.services.meta_service.get_settings", return_value=fake_settings), \
             patch("app.services.meta_service.AsyncAzureOpenAI", return_value=fake_client):
            result = await meta_service._call_llm("system", "user")
        assert result == {"intent": "play"}

    @pytest.mark.asyncio
    async def test_retries_once_on_429(self) -> None:
        import httpx
        from openai import RateLimitError

        fake_settings = MagicMock(
            azure_openai_key="key", azure_openai_endpoint="https://x.example",
            azure_openai_model="gpt-4.1-mini", azure_openai_api_version="v1",
        )

        rate_limited = RateLimitError(
            "rate limited",
            response=httpx.Response(
                429, request=httpx.Request("POST", "https://x.example"), headers={"retry-after": "0"}
            ),
            body=None,
        )

        ok_resp = MagicMock()
        ok_resp.choices = [MagicMock(message=MagicMock(content='{"ok": true}'))]
        fake_client = MagicMock()
        fake_client.chat.completions.create = AsyncMock(side_effect=[rate_limited, ok_resp])

        with patch("app.services.meta_service.get_settings", return_value=fake_settings), \
             patch("app.services.meta_service.AsyncAzureOpenAI", return_value=fake_client), \
             patch("asyncio.sleep", AsyncMock()):
            result = await meta_service._call_llm("system", "user")
        assert result == {"ok": True}
        assert fake_client.chat.completions.create.call_count == 2

    @pytest.mark.asyncio
    async def test_non_429_error_propagates(self) -> None:
        fake_settings = MagicMock(
            azure_openai_key="key", azure_openai_endpoint="https://x.example",
            azure_openai_model="gpt-4.1-mini", azure_openai_api_version="v1",
        )
        fake_client = MagicMock()
        fake_client.chat.completions.create = AsyncMock(side_effect=ValueError("boom"))

        with patch("app.services.meta_service.get_settings", return_value=fake_settings), \
             patch("app.services.meta_service.AsyncAzureOpenAI", return_value=fake_client), \
             pytest.raises(ValueError, match="boom"):
            await meta_service._call_llm("system", "user")


# ---------------------------------------------------------------------------
# get_db_context / reason_about_command / plan_commands — Phase 1/2 sharing
# ---------------------------------------------------------------------------


class TestPhaseContextSharing:
    @pytest.mark.asyncio
    async def test_get_db_context_fetches_once_and_formats(self, mock_db, user_info) -> None:
        with patch(
            "app.services.meta_service.fetch_context_from_db",
            AsyncMock(return_value={"content": [], "classes": [], "students": []}),
        ) as mock_fetch:
            ctx = await meta_service.get_db_context("play a song", user_info, mock_db)
        mock_fetch.assert_awaited_once()
        assert ctx == "(no matching data found in database)"

    @pytest.mark.asyncio
    async def test_reason_and_plan_reuse_same_db_context_without_refetching(self, user_info) -> None:
        """Regression: reason_about_command/plan_commands must not call fetch_context_from_db
        themselves — the controller fetches once via get_db_context and passes db_context in."""
        with patch("app.services.meta_service._call_llm", AsyncMock(return_value={"intent": "play"})) as mock_llm, \
             patch("app.services.meta_service.fetch_context_from_db") as mock_fetch:
            reasoning = await meta_service.reason_about_command("play a song", user_info, "SHARED_CTX")
            await meta_service.plan_commands("play a song", user_info, reasoning, "SHARED_CTX")

        mock_fetch.assert_not_called()
        assert mock_llm.call_count == 2
        for call in mock_llm.call_args_list:
            assert "SHARED_CTX" in call.args[0]


# ---------------------------------------------------------------------------
# normalize_plan
# ---------------------------------------------------------------------------


class TestNormalizePlan:
    def test_error_shape_passthrough(self) -> None:
        assert meta_service.normalize_plan({"error": "nope"}) == {"error": "nope"}

    def test_commands_key(self) -> None:
        plan = {"commands": [{"method": "GET", "path": "/class/"}]}
        assert meta_service.normalize_plan(plan)["commands"] == plan["commands"]

    def test_steps_key_fallback(self) -> None:
        plan = {"steps": [{"method": "GET", "path": "/class/"}]}
        assert meta_service.normalize_plan(plan)["commands"] == plan["steps"]

    def test_bare_plan_wrapped_in_list(self) -> None:
        plan = {"method": "GET", "path": "/class/"}
        assert meta_service.normalize_plan(plan)["commands"] == [plan]

    def test_needs_input_detected(self) -> None:
        plan = {"commands": [{"needsInput": True}]}
        assert meta_service.normalize_plan(plan)["needsInput"] is True


# ---------------------------------------------------------------------------
# _resolve_placeholders
# ---------------------------------------------------------------------------


class TestResolvePlaceholders:
    def test_simple_field_substitution(self) -> None:
        context = {"step1": {"data": {"_id": "abc123"}}}
        out = meta_service._resolve_placeholders("/class/{{step1.data._id}}", context)
        assert out == "/class/abc123"

    def test_bare_index_placeholder_normalised_to_step_form(self) -> None:
        """The planner LLM emits {{1.data.id}} off the zero-based results array; it must
        resolve to step2 (the second command), not step1."""
        context = {"step1": {"data": {"id": "wrong"}}, "step2": {"data": {"id": "conf-42"}}}
        out = meta_service._resolve_placeholders("/conference/start/{{1.data.id}}", context)
        assert out == "/conference/start/conf-42"

    def test_explicit_step_placeholder_is_not_renumbered(self) -> None:
        context = {"step1": {"data": {"id": "conf-1"}}, "step2": {"data": {"id": "conf-2"}}}
        out = meta_service._resolve_placeholders("/conference/start/{{step1.data.id}}", context)
        assert out == "/conference/start/conf-1"

    def test_unresolved_placeholder_left_literal_and_logged(self, caplog) -> None:
        with caplog.at_level("WARNING"):
            out = meta_service._resolve_placeholders("/class/{{step1.data._id}}", {})
        assert out == "/class/{{step1.data._id}}"
        assert any("unresolved placeholder" in r.message for r in caplog.records)

    def test_array_search_placeholder(self) -> None:
        context = {"step1": {"data": [{"name": "Alice", "_id": "id1"}, {"name": "Bob", "_id": "id2"}]}}
        out = meta_service._resolve_placeholders("{{step1.data[name=bob]._id}}", context)
        assert out == "id2"

    def test_full_data_placeholder(self) -> None:
        context = {"step1": {"data": {"a": 1}}}
        out = meta_service._resolve_placeholders("{{step1.data}}", context)
        assert out == '{"a": 1}'

    def test_dict_json_array_reparse(self) -> None:
        context = {"step1": {"data": {"ids": ["x", "y"]}}}
        target = {"students": "{{step1.data.ids}}"}
        out = meta_service._resolve_placeholders(target, context)
        assert out["students"] == ["x", "y"]

    def test_malformed_json_reparse_logs_and_keeps_string(self, caplog) -> None:
        target = {"weird": "[not valid json]"}
        with caplog.at_level("WARNING"):
            out = meta_service._resolve_placeholders(target, {})
        assert out["weird"] == "[not valid json]"
        assert any("failed to re-parse placeholder JSON" in r.message for r in caplog.records)

    def test_none_passthrough(self) -> None:
        assert meta_service._resolve_placeholders(None, {}) is None


# ---------------------------------------------------------------------------
# _is_command_allowed — the security allowlist
# ---------------------------------------------------------------------------


class TestCommandAllowlist:
    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("GET", "/content/"),
            ("GET", "/content/abc123"),
            ("GET", "/content/themes"),
            ("GET", "/class/"),
            ("POST", "/class/"),
            ("GET", "/class/abc123"),
            ("DELETE", "/class/abc123"),
            ("GET", "/teacher/me"),
            ("GET", "/tenant/names"),
            ("POST", "/conference/create"),
            ("POST", "/conference/start/conf1"),
            ("PUT", "/conference/end/conf1"),
            ("PUT", "/conference/muteall/conf1"),
            ("PUT", "/conference/addparticipant/conf1"),
        ],
    )
    def test_documented_routes_are_allowed(self, method: str, path: str) -> None:
        assert meta_service._is_command_allowed(method, path) is True

    @pytest.mark.parametrize(
        ("method", "path"),
        [
            ("GET", "/admin/users"),
            ("DELETE", "/student/abc123"),
            ("POST", "/student/abc123"),
            ("GET", "/school/"),
            ("PATCH", "/class/abc123"),
            ("DELETE", "/teacher/me"),
            ("GET", "/meta/voice-command"),
            ("PUT", "/tenant/names"),
        ],
    )
    def test_undocumented_or_wrong_method_routes_are_denied(self, method: str, path: str) -> None:
        assert meta_service._is_command_allowed(method, path) is False

    def test_query_string_is_stripped_before_matching(self) -> None:
        assert meta_service._is_command_allowed("GET", "/content/?expName=song") is True

    def test_method_is_case_insensitive(self) -> None:
        assert meta_service._is_command_allowed("get", "/content/") is True


# ---------------------------------------------------------------------------
# execute_commands / _execute_single
# ---------------------------------------------------------------------------


def _mock_aiohttp_session(status: int = 200, json_data: Any = None):
    """Build a MagicMock aiohttp.ClientSession that returns a fixed response.

    The returned context-manager mock also exposes the inner `session` mock as
    `.session` so callers can assert on `session.request` (e.g. "never hit the
    network") — execute_commands now opens exactly one ClientSession for the
    whole command list, so "was ClientSession() called" no longer distinguishes
    "a request went out" from "no requests went out".
    """
    resp = MagicMock()
    resp.status = status
    resp.json = AsyncMock(return_value=json_data if json_data is not None else {})

    request_cm = MagicMock()
    request_cm.__aenter__ = AsyncMock(return_value=resp)
    request_cm.__aexit__ = AsyncMock(return_value=False)

    session = MagicMock()
    session.request = MagicMock(return_value=request_cm)

    session_cm = MagicMock()
    session_cm.__aenter__ = AsyncMock(return_value=session)
    session_cm.__aexit__ = AsyncMock(return_value=False)
    session_cm.session = session
    return session_cm


class TestExecuteCommands:
    @pytest.mark.asyncio
    async def test_allowed_command_is_executed(self) -> None:
        with patch("aiohttp.ClientSession", return_value=_mock_aiohttp_session(200, {"ok": True})):
            results = await meta_service.execute_commands(
                [{"method": "GET", "path": "/content/", "description": "fetch content"}],
                auth_token="tok",
                base_url="http://api",
            )
        assert results == [{"step": "fetch content", "status": 200, "data": {"ok": True}}]

    @pytest.mark.asyncio
    async def test_disallowed_command_is_rejected_without_network_call(self) -> None:
        """Regression: a hallucinated/injected path must never reach _execute_single.

        execute_commands now opens one ClientSession for the whole call regardless
        of whether any step actually dispatches, so the no-network-call assertion
        is on session.request (never invoked), not on ClientSession() itself."""
        session_cm = _mock_aiohttp_session()
        with patch("aiohttp.ClientSession", return_value=session_cm):
            results = await meta_service.execute_commands(
                [{"method": "DELETE", "path": "/student/abc123", "description": "delete student"}],
                auth_token="tok",
                base_url="http://api",
            )
        session_cm.session.request.assert_not_called()
        assert results[0]["status"] == 403
        assert "not permitted" in results[0]["error"]

    @pytest.mark.asyncio
    async def test_unresolved_placeholder_is_rejected_without_network_call(self) -> None:
        """Regression: a step referencing a missing prior-step field must not be
        dispatched with the literal {{...}} marker still embedded in the URL."""
        session_cm = _mock_aiohttp_session()
        with patch("aiohttp.ClientSession", return_value=session_cm):
            results = await meta_service.execute_commands(
                [{"method": "GET", "path": "/class/{{step1.data._id}}", "description": "get class"}],
                auth_token="tok",
                base_url="http://api",
            )
        session_cm.session.request.assert_not_called()
        assert results[0]["status"] == 400
        assert "resolve placeholder" in results[0]["error"]

    @pytest.mark.asyncio
    async def test_navigate_pseudo_command_never_hits_network(self) -> None:
        session_cm = _mock_aiohttp_session()
        with patch("aiohttp.ClientSession", return_value=session_cm):
            results = await meta_service.execute_commands(
                [{"method": "NAVIGATE", "path": "/classrooms", "description": "go home"}],
                auth_token="tok",
                base_url="http://api",
            )
        session_cm.session.request.assert_not_called()
        assert results[0]["data"] == {"navigate": "/classrooms"}

    @pytest.mark.asyncio
    async def test_foreach_disallowed_path_rejected_per_item(self) -> None:
        context_cmd = {
            "method": "GET",
            "path": "/class/",
            "description": "list classes",
        }
        foreach_cmd = {
            "method": "DELETE",
            "path": "/student/{{step1.data[]._id}}",
            "forEach": True,
            "description": "delete students",
        }
        session_cm = _mock_aiohttp_session(200, [{"_id": "s1"}])
        with patch("aiohttp.ClientSession", return_value=session_cm):
            results = await meta_service.execute_commands(
                [context_cmd, foreach_cmd], auth_token="tok", base_url="http://api"
            )
        # Only the first (allowed) command should have dispatched a request —
        # the forEach step's disallowed per-item path must never reach the network.
        assert session_cm.session.request.call_count == 1
        assert results[-1]["status"] == 403

    @pytest.mark.asyncio
    async def test_chained_placeholder_resolves_from_prior_step(self) -> None:
        list_resp = MagicMock()
        list_resp.status = 200
        list_resp.json = AsyncMock(return_value={"data": [{"_id": "class1"}]})
        list_request_cm = MagicMock(__aenter__=AsyncMock(return_value=list_resp), __aexit__=AsyncMock(return_value=False))

        get_resp = MagicMock()
        get_resp.status = 200
        get_resp.json = AsyncMock(return_value={"name": "Class 1"})
        get_request_cm = MagicMock(__aenter__=AsyncMock(return_value=get_resp), __aexit__=AsyncMock(return_value=False))

        session = MagicMock()
        session.request = MagicMock(side_effect=[list_request_cm, get_request_cm])
        session_cm = MagicMock(__aenter__=AsyncMock(return_value=session), __aexit__=AsyncMock(return_value=False))

        with patch("aiohttp.ClientSession", return_value=session_cm):
            results = await meta_service.execute_commands(
                [
                    {"method": "GET", "path": "/class/", "description": "list"},
                    {"method": "GET", "path": "/class/{{step1.data.data}}", "description": "get one"},
                ],
                auth_token="tok",
                base_url="http://api",
            )
        assert results[1]["status"] == 200


class TestExecuteSingle:
    @pytest.mark.asyncio
    async def test_success_response(self) -> None:
        session_cm = _mock_aiohttp_session(200, {"a": 1})
        session = session_cm.session
        r = await meta_service._execute_single("GET", "http://api/x", None, "secret-tok", "desc", session)
        assert r == {"step": "desc", "status": 200, "data": {"a": 1}}

    @pytest.mark.asyncio
    async def test_exception_redacts_token_from_error(self) -> None:
        session = MagicMock()
        session.request = MagicMock(
            side_effect=aiohttp.ClientError("failed with token secret-tok in headers")
        )
        r = await meta_service._execute_single("GET", "http://api/x", None, "secret-tok", "desc", session)
        assert r["status"] == 500
        assert "secret-tok" not in r["error"]
        assert "[REDACTED]" in r["error"]


# ---------------------------------------------------------------------------
# generate_spoken_summary
# ---------------------------------------------------------------------------


class TestGenerateSpokenSummary:
    @pytest.mark.asyncio
    async def test_summarizes_success_and_failure_steps(self) -> None:
        results = [
            {"step": "fetch content", "status": 200, "data": [{"name": "Song A"}]},
            {"step": "start call", "status": 500, "error": "boom"},
        ]
        with patch("app.services.meta_service._call_llm", AsyncMock(return_value={"spokenText": "done"})) as mock_llm:
            out = await meta_service.generate_spoken_summary("play song A", results)
        assert out == {"spokenText": "done"}
        user_message = mock_llm.call_args.args[1]
        assert "SUCCESS" in user_message
        assert "FAILED — boom" in user_message


# ---------------------------------------------------------------------------
# synthesize_speech
# ---------------------------------------------------------------------------


class TestSynthesizeSpeech:
    @pytest.mark.asyncio
    async def test_raises_when_not_configured(self) -> None:
        with patch(
            "app.services.meta_service.get_settings",
            return_value=MagicMock(azure_speech_key="", tts_subscription_key="", azure_speech_region="", tts_region=""),
        ), pytest.raises(RuntimeError, match="Azure Speech not configured"):
            await meta_service.synthesize_speech("hello")

    @pytest.mark.asyncio
    async def test_returns_base64_on_success(self) -> None:
        settings = MagicMock(
            azure_speech_key="key", tts_subscription_key="", azure_speech_region="centralindia",
            tts_region="", tts_voice="en-US-AvaNeural",
        )
        resp = MagicMock()
        resp.status = 200
        resp.read = AsyncMock(return_value=b"mp3bytes")
        post_cm = MagicMock(__aenter__=AsyncMock(return_value=resp), __aexit__=AsyncMock(return_value=False))
        session = MagicMock()
        session.post = MagicMock(return_value=post_cm)
        session_cm = MagicMock(__aenter__=AsyncMock(return_value=session), __aexit__=AsyncMock(return_value=False))

        with patch("app.services.meta_service.get_settings", return_value=settings), \
             patch("aiohttp.ClientSession", return_value=session_cm):
            out = await meta_service.synthesize_speech("hello")
        assert out == "bXAzYnl0ZXM="

    @pytest.mark.asyncio
    async def test_non_200_raises(self) -> None:
        settings = MagicMock(
            azure_speech_key="key", tts_subscription_key="", azure_speech_region="centralindia",
            tts_region="", tts_voice="en-US-AvaNeural",
        )
        resp = MagicMock()
        resp.status = 401
        resp.text = AsyncMock(return_value="unauthorized")
        post_cm = MagicMock(__aenter__=AsyncMock(return_value=resp), __aexit__=AsyncMock(return_value=False))
        session = MagicMock()
        session.post = MagicMock(return_value=post_cm)
        session_cm = MagicMock(__aenter__=AsyncMock(return_value=session), __aexit__=AsyncMock(return_value=False))

        with patch("app.services.meta_service.get_settings", return_value=settings), \
             patch("aiohttp.ClientSession", return_value=session_cm), \
             pytest.raises(RuntimeError, match="TTS error 401"):
            await meta_service.synthesize_speech("hello")


# ---------------------------------------------------------------------------
# transcribe_audio
# ---------------------------------------------------------------------------


class TestTranscribeAudio:
    @pytest.mark.asyncio
    async def test_raises_if_not_configured(self) -> None:
        with patch(
            "app.services.meta_service.get_settings",
            return_value=MagicMock(azure_speech_key="", tts_subscription_key="", azure_speech_region="", tts_region=""),
        ), pytest.raises(RuntimeError, match="Azure Speech not configured"):
            await meta_service.transcribe_audio(b"fake-audio-bytes")

    @pytest.mark.asyncio
    async def test_ffmpeg_failure_raises(self) -> None:
        settings = MagicMock(azure_speech_key="key", tts_subscription_key="", azure_speech_region="region", tts_region="")
        proc = MagicMock()
        proc.communicate = AsyncMock(return_value=(b"", b"ffmpeg exploded"))
        proc.returncode = 1

        with patch("app.services.meta_service.get_settings", return_value=settings), \
             patch("asyncio.create_subprocess_exec", AsyncMock(return_value=proc)), \
             pytest.raises(RuntimeError, match="ffmpeg conversion failed"):
            await meta_service.transcribe_audio(b"fake-audio-bytes")

    @pytest.mark.asyncio
    async def test_stt_non_success_returns_empty_string(self) -> None:
        settings = MagicMock(azure_speech_key="key", tts_subscription_key="", azure_speech_region="region", tts_region="")
        proc = MagicMock()
        proc.communicate = AsyncMock(return_value=(b"\x00\x00", b""))
        proc.returncode = 0

        resp = MagicMock()
        resp.json = AsyncMock(return_value={"RecognitionStatus": "NoMatch"})
        post_cm = MagicMock(__aenter__=AsyncMock(return_value=resp), __aexit__=AsyncMock(return_value=False))
        session = MagicMock()
        session.post = MagicMock(return_value=post_cm)
        session_cm = MagicMock(__aenter__=AsyncMock(return_value=session), __aexit__=AsyncMock(return_value=False))

        with patch("app.services.meta_service.get_settings", return_value=settings), \
             patch("asyncio.create_subprocess_exec", AsyncMock(return_value=proc)), \
             patch("aiohttp.ClientSession", return_value=session_cm):
            assert await meta_service.transcribe_audio(b"fake-audio-bytes") == ""

    @pytest.mark.asyncio
    async def test_stt_success_returns_display_text(self) -> None:
        settings = MagicMock(azure_speech_key="key", tts_subscription_key="", azure_speech_region="region", tts_region="")
        proc = MagicMock()
        proc.communicate = AsyncMock(return_value=(b"\x00\x00", b""))
        proc.returncode = 0

        resp = MagicMock()
        resp.json = AsyncMock(return_value={"RecognitionStatus": "Success", "DisplayText": "play a song"})
        post_cm = MagicMock(__aenter__=AsyncMock(return_value=resp), __aexit__=AsyncMock(return_value=False))
        session = MagicMock()
        session.post = MagicMock(return_value=post_cm)
        session_cm = MagicMock(__aenter__=AsyncMock(return_value=session), __aexit__=AsyncMock(return_value=False))

        with patch("app.services.meta_service.get_settings", return_value=settings), \
             patch("asyncio.create_subprocess_exec", AsyncMock(return_value=proc)), \
             patch("aiohttp.ClientSession", return_value=session_cm):
            assert await meta_service.transcribe_audio(b"fake-audio-bytes") == "play a song"


# ---------------------------------------------------------------------------
# get_tts_prompt
# ---------------------------------------------------------------------------


class TestGetTtsPrompt:
    @pytest.mark.asyncio
    async def test_unknown_prompt_type_returns_none(self) -> None:
        assert await meta_service.get_tts_prompt("does-not-exist") is None

    @pytest.mark.asyncio
    async def test_known_prompt_synthesizes_and_caches(self) -> None:
        meta_service._tts_cache.pop("thinking", None)
        with patch("app.services.meta_service.synthesize_speech", AsyncMock(return_value="audio1")) as mock_synth:
            first = await meta_service.get_tts_prompt("thinking")
            second = await meta_service.get_tts_prompt("thinking")
        assert first.audioBase64 == "audio1"
        assert second.audioBase64 == "audio1"
        mock_synth.assert_awaited_once()  # second call served from cache
