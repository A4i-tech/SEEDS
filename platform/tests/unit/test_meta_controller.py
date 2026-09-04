"""
Unit tests for meta_controller (/meta/* voice/text command endpoints).

Uses httpx.AsyncClient with ASGI transport, dependency overrides for auth/DB,
and mocked meta_service calls — no real DB, LLM, or TTS/STT services are touched.
"""

from __future__ import annotations

import io
import os
from typing import Any
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only")
os.environ.setdefault("AUTH_TYPE", "jwt")
os.environ.setdefault("JWT_EXPIRES_IN", "1d")

from app.controllers import meta_controller  # noqa: E402
from app.platform.auth.dependencies import get_db  # noqa: E402
from app.platform.error_handling import register_error_handlers  # noqa: E402

FAKE_USER: dict[str, Any] = {
    "sub": "teacher1", "role": "teacher", "tenant_id": "tenant1", "school_id": "school1",
}


def _make_app() -> FastAPI:
    app = FastAPI()
    app.include_router(meta_controller.router)
    register_error_handlers(app)

    async def _fake_get_db():
        yield MagicMock()

    app.dependency_overrides[get_db] = _fake_get_db
    app.dependency_overrides[meta_controller._require_teacher] = lambda: FAKE_USER
    return app


@pytest.fixture
def client():
    app = _make_app()
    transport = ASGITransport(app=app)
    return AsyncClient(transport=transport, base_url="http://test")


@pytest.fixture(autouse=True)
def _mock_user_repository():
    """build_user_info() looks up the caller in Mongo — stub it out for every test."""
    fake_user = MagicMock(phone="9999999999", school_id="school1", name="Teacher One")
    with patch("app.services.meta_service.UserRepository") as mock_repo_cls:
        mock_repo_cls.return_value.find_by_id = AsyncMock(return_value=fake_user)
        yield mock_repo_cls


def _audio_file() -> dict[str, Any]:
    return {"audio": ("clip.webm", io.BytesIO(b"fake-audio-bytes"), "audio/webm")}


# ---------------------------------------------------------------------------
# /meta/voice-command
# ---------------------------------------------------------------------------


class TestVoiceCommand:
    @pytest.mark.asyncio
    async def test_empty_transcript_returns_400(self, client) -> None:
        with patch("app.controllers.meta_controller.meta_service.transcribe_audio", AsyncMock(return_value="   ")):
            resp = await client.post("/meta/voice-command", files=_audio_file(), data={"context": "{}"})
        assert resp.status_code == 400
        assert "no speech" in resp.json()["message"]

    @pytest.mark.asyncio
    async def test_happy_path_shares_one_db_context_across_both_phases(self, client) -> None:
        """Regression: get_db_context() must be called exactly once and its result
        passed into both reason_about_command and plan_commands (no duplicate fetch)."""
        with patch("app.controllers.meta_controller.meta_service.transcribe_audio", AsyncMock(return_value="play a song")), \
             patch("app.controllers.meta_controller.meta_service.get_db_context", AsyncMock(return_value="SHARED_CTX")) as mock_ctx, \
             patch("app.controllers.meta_controller.meta_service.reason_about_command", AsyncMock(
                 return_value={"intent": "play", "reasoning": "x", "steps": [], "can_auto_resolve": True})) as mock_reason, \
             patch("app.controllers.meta_controller.meta_service.plan_commands", AsyncMock(
                 return_value={"commands": [{"method": "GET", "path": "/content/", "description": "list content"}]})) as mock_plan, \
             patch("app.controllers.meta_controller.meta_service.execute_commands", AsyncMock(
                 return_value=[{"step": "fetch content", "status": 200, "data": {}}])), \
             patch("app.controllers.meta_controller.meta_service.generate_spoken_summary", AsyncMock(
                 return_value={"spokenText": "Playing it now."})), \
             patch("app.controllers.meta_controller.meta_service.synthesize_speech", AsyncMock(return_value="b64audio")):
            resp = await client.post("/meta/voice-command", files=_audio_file(), data={"context": "{}"})

        assert resp.status_code == 200
        body = resp.json()
        assert body["spoken_summary"] == "Playing it now."
        assert body["audio_base64"] == "b64audio"

        mock_ctx.assert_awaited_once()
        assert mock_reason.call_args.args[-1] == "SHARED_CTX"
        assert mock_plan.call_args.args[-1] == "SHARED_CTX"

    @pytest.mark.asyncio
    async def test_reasoning_failure_returns_502_with_cause(self, client) -> None:
        with patch("app.controllers.meta_controller.meta_service.transcribe_audio", AsyncMock(return_value="play a song")), \
             patch("app.controllers.meta_controller.meta_service.get_db_context", AsyncMock(return_value="CTX")), \
             patch("app.controllers.meta_controller.meta_service.reason_about_command",
                   AsyncMock(side_effect=RuntimeError("Azure OpenAI not configured"))):
            resp = await client.post("/meta/voice-command", files=_audio_file(), data={"context": "{}"})
        assert resp.status_code == 502
        assert "Azure OpenAI not configured" in resp.json()["message"]

    @pytest.mark.asyncio
    async def test_planning_failure_returns_502_with_cause(self, client) -> None:
        with patch("app.controllers.meta_controller.meta_service.transcribe_audio", AsyncMock(return_value="play a song")), \
             patch("app.controllers.meta_controller.meta_service.get_db_context", AsyncMock(return_value="CTX")), \
             patch("app.controllers.meta_controller.meta_service.reason_about_command", AsyncMock(
                 return_value={"intent": "play", "reasoning": "x", "steps": [], "can_auto_resolve": True})), \
             patch("app.controllers.meta_controller.meta_service.plan_commands",
                   AsyncMock(side_effect=ValueError("planner boom"))):
            resp = await client.post("/meta/voice-command", files=_audio_file(), data={"context": "{}"})
        assert resp.status_code == 502
        assert "planner boom" in resp.json()["message"]

    @pytest.mark.asyncio
    async def test_unresolvable_command_skips_planning_and_speaks_explanation(self, client) -> None:
        with patch("app.controllers.meta_controller.meta_service.transcribe_audio", AsyncMock(return_value="what can you do")), \
             patch("app.controllers.meta_controller.meta_service.get_db_context", AsyncMock(return_value="CTX")), \
             patch("app.controllers.meta_controller.meta_service.reason_about_command", AsyncMock(
                 return_value={"intent": "x", "reasoning": "x", "steps": [], "can_auto_resolve": False, "unresolved_note": "Here's what I can help with."})), \
             patch("app.controllers.meta_controller.meta_service.plan_commands") as mock_plan, \
             patch("app.controllers.meta_controller.meta_service.generate_spoken_summary", AsyncMock(
                 return_value={"spokenText": "Here's what I can help with."})), \
             patch("app.controllers.meta_controller.meta_service.synthesize_speech", AsyncMock(return_value="b64")):
            resp = await client.post("/meta/voice-command", files=_audio_file(), data={"context": "{}"})

        assert resp.status_code == 200
        assert resp.json()["commands"] == []
        mock_plan.assert_not_called()

    @pytest.mark.asyncio
    async def test_oversized_audio_rejected(self, client) -> None:
        big_file = {"audio": ("clip.webm", io.BytesIO(b"x" * (26 * 1024 * 1024)), "audio/webm")}
        resp = await client.post("/meta/voice-command", files=big_file, data={"context": "{}"})
        assert resp.status_code == 413


# ---------------------------------------------------------------------------
# /meta/text-command
# ---------------------------------------------------------------------------


class TestTextCommand:
    @pytest.mark.asyncio
    async def test_empty_command_returns_400(self, client) -> None:
        resp = await client.post("/meta/text-command", json={"command": "", "context": {}})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_needs_input_short_circuits_execution(self, client) -> None:
        with patch("app.controllers.meta_controller.meta_service.get_db_context", AsyncMock(return_value="CTX")), \
             patch("app.controllers.meta_controller.meta_service.reason_about_command", AsyncMock(
                 return_value={"intent": "add student", "reasoning": "x", "steps": [], "can_auto_resolve": True})), \
             patch("app.controllers.meta_controller.meta_service.plan_commands", AsyncMock(
                 return_value={"commands": [{"method": "POST", "path": "/student/", "description": "add student", "needs_input": True}]})), \
             patch("app.controllers.meta_controller.meta_service.execute_commands") as mock_execute:
            resp = await client.post("/meta/text-command", json={"command": "add a student", "context": {}})
        assert resp.status_code == 200
        assert resp.json()["needs_input"] is True
        mock_execute.assert_not_called()

    @pytest.mark.asyncio
    async def test_plan_error_shape_returned_without_executing(self, client) -> None:
        with patch("app.controllers.meta_controller.meta_service.get_db_context", AsyncMock(return_value="CTX")), \
             patch("app.controllers.meta_controller.meta_service.reason_about_command", AsyncMock(
                 return_value={"intent": "?", "reasoning": "x", "steps": [], "can_auto_resolve": True})), \
             patch("app.controllers.meta_controller.meta_service.plan_commands", AsyncMock(
                 return_value={"error": "I could not understand that command. Please try again."})), \
             patch("app.controllers.meta_controller.meta_service.execute_commands") as mock_execute:
            resp = await client.post("/meta/text-command", json={"command": "gibberish", "context": {}})
        assert resp.status_code == 200
        assert "error" in resp.json()
        mock_execute.assert_not_called()


# ---------------------------------------------------------------------------
# /meta/transcribe
# ---------------------------------------------------------------------------


class TestTranscribeEndpoint:
    @pytest.mark.asyncio
    async def test_returns_transcript(self, client) -> None:
        with patch("app.controllers.meta_controller.meta_service.transcribe_audio", AsyncMock(return_value="hello world")):
            resp = await client.post("/meta/transcribe", files=_audio_file())
        assert resp.status_code == 200
        assert resp.json() == {"transcript": "hello world"}


# ---------------------------------------------------------------------------
# /meta/tts-prompt (public — no auth override needed)
# ---------------------------------------------------------------------------


class TestTtsPrompt:
    @pytest.mark.asyncio
    async def test_unknown_type_returns_400(self, client) -> None:
        with patch("app.controllers.meta_controller.meta_service.get_tts_prompt", AsyncMock(return_value=None)):
            resp = await client.post("/meta/tts-prompt", json={"type": "nonexistent"})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_known_type_returns_audio(self, client) -> None:
        with patch("app.controllers.meta_controller.meta_service.get_tts_prompt", AsyncMock(
            return_value={"text": "Hey there!", "audio_base64": "b64"}
        )):
            resp = await client.post("/meta/tts-prompt", json={"type": "welcome"})
        assert resp.status_code == 200
        assert resp.json() == {"text": "Hey there!", "audio_base64": "b64"}
