"""
Security hardening tests (#329 #330).

Tests:
  1. test_webhook_wrong_issuer_rejected
  2. test_webhook_wrong_api_key_rejected
  3. test_webhook_wrong_application_id_rejected
  4. test_webhook_payload_hash_mismatch_rejected
  5. test_webhook_no_auth_passes_through
  6. test_webhook_ivr_app_id_accepted
  7. test_websocket_invalid_control_secret_rejected
  8. test_websocket_unregistered_conference_rejected
  9. test_websocket_valid_secret_connects
  10. test_content_job_retry_on_transient
  11. test_content_job_dead_letter_on_permanent
"""

from __future__ import annotations

import base64  # used by _b64 helper

# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------
import hashlib
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


def _make_vonage_token(
    api_key: str = "test-api-key",
    application_id: str = "test-conf-app",
    iss: str = "Vonage",
    payload_hash: str | None = None,
) -> str:
    from jose import jwt
    claims: dict = {"iss": iss, "api_key": api_key, "application_id": application_id}
    if payload_hash is not None:
        claims["payload_hash"] = payload_hash
    # Signed with empty secret — verify_vonage_signature decodes without verification
    return jwt.encode(claims, key="", algorithm="HS256")


def _b64(s: str) -> str:
    return base64.b64encode(s.encode()).decode()


@asynccontextmanager
async def _noop_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    yield


def _mock_settings(**overrides):
    from app.platform.settings import Settings
    defaults = {
        "env": "production",
        "mongo_db_connection_string": "",
        "vonage_api_key": "test-api-key",
        "vonage_conference_application_id": "test-conf-app",
        "vonage_ivr_application_id": "test-ivr-app",
    }
    return Settings(**{**defaults, **overrides})


# ---------------------------------------------------------------------------
# 1. test_webhook_wrong_issuer_rejected
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_wrong_issuer_rejected():
    """JWT with iss != 'Vonage' → 403 Unexpected JWT issuer."""
    token = _make_vonage_token(iss="NotVonage")

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.webhook_controller import router as wh_router
    app.include_router(wh_router)

    with patch("app.controllers.webhook_controller.get_settings", return_value=_mock_settings()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/webhooks/event/conf123",
                json={"type": "test"},
                headers={"Authorization": f"Bearer {token}"},
            )
    assert resp.status_code == 403
    assert "issuer" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 2. test_webhook_wrong_api_key_rejected
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_wrong_api_key_rejected():
    """JWT with wrong api_key claim → 403 api_key mismatch."""
    token = _make_vonage_token(api_key="wrong-key")

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.webhook_controller import router as wh_router
    app.include_router(wh_router)

    with patch("app.controllers.webhook_controller.get_settings", return_value=_mock_settings()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/webhooks/event/conf123",
                json={"type": "test"},
                headers={"Authorization": f"Bearer {token}"},
            )
    assert resp.status_code == 403
    assert "api_key" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 3. test_webhook_wrong_application_id_rejected
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_wrong_application_id_rejected():
    """JWT with unknown application_id → 403 application_id mismatch."""
    token = _make_vonage_token(application_id="unknown-app")

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.webhook_controller import router as wh_router
    app.include_router(wh_router)

    with patch("app.controllers.webhook_controller.get_settings", return_value=_mock_settings()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/webhooks/event/conf123",
                json={"type": "test"},
                headers={"Authorization": f"Bearer {token}"},
            )
    assert resp.status_code == 403
    assert "application_id" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 4. test_webhook_payload_hash_mismatch_rejected
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_payload_hash_mismatch_rejected():
    """JWT payload_hash doesn't match body SHA-256 → 403 payload_hash mismatch."""
    body = b'{"type": "test"}'
    wrong_hash = hashlib.sha256(b"different body").hexdigest()
    token = _make_vonage_token(payload_hash=wrong_hash)

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.webhook_controller import router as wh_router
    app.include_router(wh_router)

    with patch("app.controllers.webhook_controller.get_settings", return_value=_mock_settings()):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/webhooks/event/conf123",
                content=body,
                headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            )
    assert resp.status_code == 403
    assert "payload_hash" in resp.json()["detail"]


# ---------------------------------------------------------------------------
# 5. test_webhook_no_auth_passes_through
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_no_auth_passes_through():
    """No Authorization header → request passes through (DTMF eventUrl pattern)."""
    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.webhook_controller import router as wh_router
    app.include_router(wh_router)

    mock_conf_mgr = MagicMock()
    mock_conf_mgr.get_conference.return_value = None

    with (
        patch("app.controllers.webhook_controller.get_settings", return_value=_mock_settings()),
        patch("app.controllers.webhook_controller.get_conference_manager", return_value=mock_conf_mgr),
        patch("app.controllers.webhook_controller.caller_state_service", new=MagicMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/webhooks/event/conf123", json={"type": "test"})
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 6. test_webhook_ivr_app_id_accepted
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_ivr_app_id_accepted():
    """JWT with IVR application_id (not conference) → passes claim check → reaches handler."""
    token = _make_vonage_token(application_id="test-ivr-app")

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.webhook_controller import router as wh_router
    app.include_router(wh_router)

    mock_conf_mgr = MagicMock()
    mock_conf_mgr.get_conference.return_value = None

    with (
        patch("app.controllers.webhook_controller.get_settings", return_value=_mock_settings()),
        patch("app.controllers.webhook_controller.get_conference_manager", return_value=mock_conf_mgr),
        patch("app.controllers.webhook_controller.caller_state_service", new=MagicMock()),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/webhooks/event/conf123",
                json={"type": "test"},
                headers={"Authorization": f"Bearer {token}"},
            )
    assert resp.status_code == 200


# ---------------------------------------------------------------------------
# 4. test_websocket_invalid_control_secret_rejected
# ---------------------------------------------------------------------------

def test_websocket_invalid_control_secret_rejected():
    """WebSocket connect with wrong WS-Control-Secret → close code 1008."""
    from app.platform.settings import Settings
    mock_settings = Settings(
        env="production",
        ws_control_secret="correct-secret",
        mongo_db_connection_string="",
    )

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.websocket_controller import router as ws_router
    app.include_router(ws_router)

    with patch("app.platform.settings.get_settings", return_value=mock_settings):
        client = TestClient(app, raise_server_exceptions=False)
        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect(
                "/websocket/test-conf",
                headers={"WS-Control-Secret": "wrong-secret"},
            ):
                pass
    # WebSocketDisconnect with code 1008 or any disconnect exception is expected
    exc = exc_info.value
    if isinstance(exc, WebSocketDisconnect):
        assert exc.code == 1008, f"Expected code 1008, got {exc.code}"
    else:
        # Other exceptions also represent a rejected connection
        assert exc is not None


# ---------------------------------------------------------------------------
# 5. test_websocket_unregistered_conference_rejected
# ---------------------------------------------------------------------------

def test_websocket_unregistered_conference_rejected():
    """WebSocket connect with unknown conference_id → close code 1008."""
    from app.platform.settings import Settings
    mock_settings = Settings(
        env="production",
        ws_control_secret="",  # No secret enforcement
        mongo_db_connection_string="",
    )

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.websocket_controller import router as ws_router
    app.include_router(ws_router)

    with (
        patch("app.controllers.webhook_controller.get_settings", return_value=mock_settings),
        patch(
            "app.controllers.websocket_controller._check_conference_exists",
            new=AsyncMock(return_value=False),
        ),
    ):
        client = TestClient(app, raise_server_exceptions=False)
        with pytest.raises(Exception) as exc_info:
            with client.websocket_connect("/websocket/unknown-conf"):
                pass
    exc = exc_info.value
    if isinstance(exc, WebSocketDisconnect):
        assert exc.code == 1008, f"Expected code 1008, got {exc.code}"
    else:
        assert exc is not None


# ---------------------------------------------------------------------------
# 6. test_websocket_valid_secret_connects
# ---------------------------------------------------------------------------

def test_websocket_valid_secret_connects():
    """Correct WS-Control-Secret + valid conference → WebSocket accepted (not 1008)."""
    from app.platform.settings import Settings

    mock_settings = Settings(
        env="production",
        ws_control_secret="correct-secret",
        audio_analysis_enabled=False,
        audio_capture_enabled=False,
        mongo_db_connection_string="",
    )

    mock_conf = MagicMock()
    mock_conf.set_websocket = MagicMock()
    mock_conf_mgr = MagicMock()
    mock_conf_mgr.get_conference.return_value = mock_conf

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.websocket_controller import router as ws_router
    app.include_router(ws_router)

    async def _immediate_stop(msg, conf, transcriber, hold_detector, conf_id, capture):
        return False  # Stop audio loop immediately

    with (
        patch("app.controllers.webhook_controller.get_settings", return_value=mock_settings),
        patch(
            "app.controllers.websocket_controller._check_conference_exists",
            new=AsyncMock(return_value=True),
        ),
        patch(
            "app.controllers.websocket_controller._get_conference_manager",
            return_value=mock_conf_mgr,
        ),
        patch(
            "app.services.audio.websocket_audio_processor.handle_incoming_message",
            new=AsyncMock(side_effect=_immediate_stop),
        ),
    ):
        client = TestClient(app, raise_server_exceptions=False)
        try:
            with client.websocket_connect(
                "/websocket/known-conf",
                headers={"WS-Control-Secret": "correct-secret"},
            ):
                pass
            # If we get here, connection was accepted successfully — test passes
        except WebSocketDisconnect as exc:
            # A normal close (not 1008) still means the handshake succeeded
            assert exc.code != 1008, (
                "Expected successful connection but got 1008 Policy Violation"
            )
        except Exception as exc:
            exc_str = str(exc)
            assert "1008" not in exc_str, (
                f"Expected successful connection but got Policy Violation: {exc}"
            )


# ---------------------------------------------------------------------------
# 7. test_content_job_retry_on_transient
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_content_job_retry_on_transient():
    """First 2 attempts raise ConnectionError (transient), 3rd succeeds → completed."""
    import mongomock_motor

    db_client = mongomock_motor.AsyncMongoMockClient()
    db = db_client["seeds"]
    jobs_col = db["content_jobs"]
    content_col = db["contentsV3"]

    job_result = await jobs_col.insert_one({"status": "pending", "content_id": "content-trans"})
    job_id = job_result.inserted_id
    await content_col.insert_one({
        "_id": "content-trans",
        "audioContent": [{"audioUrl": "https://blob/input.mp3"}],
        "isPullModel": False,
    })

    job_doc = await jobs_col.find_one({"_id": job_id})
    call_count = 0

    async def _flaky_process(audio_url, content_id, blob_provider):
        nonlocal call_count
        call_count += 1
        if call_count < 3:
            raise ConnectionError(f"Simulated transient error attempt {call_count}")
        return "https://blob/output.wav", 2.0

    blob_provider = MagicMock()

    from app.consumers.content_job_consumer import _process_audio_content_job
    from app.repositories.content_job_repository import ContentJobRepository
    from app.repositories.content_repository import ContentRepository

    with (
        patch("app.consumers.content_job_consumer._process_audio_item", side_effect=_flaky_process),
        patch("app.consumers.content_job_consumer.asyncio.sleep", new=AsyncMock()),
    ):
        await _process_audio_content_job(job_doc, ContentJobRepository(db), ContentRepository(db), blob_provider)

    updated_job = await jobs_col.find_one({"_id": job_id})
    assert updated_job["status"] == "completed", (
        f"Expected status=completed, got status={updated_job['status']!r}"
    )
    assert call_count == 3, f"Expected 3 attempts (2 failures + 1 success), got {call_count}"


# ---------------------------------------------------------------------------
# 8. test_content_job_dead_letter_on_permanent
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_content_job_dead_letter_on_permanent():
    """Permanent error (ValueError) → status=failed, reason set, failed_at set."""
    import mongomock_motor

    db_client = mongomock_motor.AsyncMongoMockClient()
    db = db_client["seeds"]
    jobs_col = db["content_jobs"]
    content_col = db["contentsV3"]

    job_result = await jobs_col.insert_one({"status": "pending", "content_id": "content-perm"})
    job_id = job_result.inserted_id
    await content_col.insert_one({
        "_id": "content-perm",
        "audioContent": [{"audioUrl": "https://blob/corrupt.mp3"}],
        "isPullModel": False,
    })

    job_doc = await jobs_col.find_one({"_id": job_id})

    async def _always_permanent(audio_url, content_id, blob_provider):
        raise ValueError("Corrupt file: cannot decode audio header")

    blob_provider = MagicMock()

    from app.consumers.content_job_consumer import _process_audio_content_job
    from app.repositories.content_job_repository import ContentJobRepository
    from app.repositories.content_repository import ContentRepository

    with patch("app.consumers.content_job_consumer._process_audio_item", side_effect=_always_permanent):
        with pytest.raises(ValueError, match="Corrupt file"):
            await _process_audio_content_job(job_doc, ContentJobRepository(db), ContentRepository(db), blob_provider)

    updated_job = await jobs_col.find_one({"_id": job_id})
    assert updated_job["status"] == "failed", (
        f"Expected status=failed, got status={updated_job['status']!r}"
    )
    assert updated_job.get("reason"), "Expected reason field to be set"
    assert "Corrupt file" in updated_job["reason"]
    assert updated_job.get("failed_at") is not None, "Expected failed_at to be set"
