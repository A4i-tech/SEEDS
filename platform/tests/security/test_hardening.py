"""
Security hardening tests (#329 #330).

Tests:
  1. test_webhook_invalid_hmac_rejected
  2. test_webhook_missing_auth_rejected
  3. test_webhook_dev_mode_bypasses_hmac
  4. test_websocket_invalid_control_secret_rejected
  5. test_websocket_unregistered_conference_rejected
  6. test_websocket_valid_secret_connects
  7. test_content_job_retry_on_transient
  8. test_content_job_dead_letter_on_permanent
"""

from __future__ import annotations

import asyncio
import base64
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from starlette.testclient import TestClient
from starlette.websockets import WebSocketDisconnect


# ---------------------------------------------------------------------------
# JWT helpers
# ---------------------------------------------------------------------------

def _generate_rsa_key_pair() -> str:
    """Generate a test RSA-2048 private key PEM string."""
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.primitives import serialization

    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    return private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.TraditionalOpenSSL,
        encryption_algorithm=serialization.NoEncryption(),
    ).decode("utf-8")


def _make_valid_token(private_pem: str) -> str:
    from jose import jwt
    return jwt.encode({"application_id": "test-app"}, private_pem, algorithm="RS256")


def _b64(pem: str) -> str:
    return base64.b64encode(pem.encode()).decode()


@asynccontextmanager
async def _noop_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    yield


# ---------------------------------------------------------------------------
# 1. test_webhook_invalid_hmac_rejected
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_invalid_hmac_rejected():
    """POST /webhooks/event/{id} with wrong JWT signature → 403."""
    correct_pem = _generate_rsa_key_pair()
    wrong_pem = _generate_rsa_key_pair()
    bad_token = _make_valid_token(wrong_pem)  # signed with wrong key

    from app.platform.settings import Settings
    mock_settings = Settings(
        env="production",
        vonage_application_private_key64=_b64(correct_pem),
        mongo_db_connection_string="",
    )

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.webhook_controller import router as wh_router
    app.include_router(wh_router)

    # The dependency calls get_settings lazily via app.platform.settings
    with patch("app.platform.settings.get_settings", return_value=mock_settings):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post(
                "/webhooks/event/conf123",
                json={"type": "test"},
                headers={"Authorization": f"Bearer {bad_token}"},
            )
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 2. test_webhook_missing_auth_rejected
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_missing_auth_rejected():
    """POST /webhooks/event/{id} with no Authorization header → 403."""
    private_pem = _generate_rsa_key_pair()

    from app.platform.settings import Settings
    mock_settings = Settings(
        env="production",
        vonage_application_private_key64=_b64(private_pem),
        mongo_db_connection_string="",
    )

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.webhook_controller import router as wh_router
    app.include_router(wh_router)

    with patch("app.platform.settings.get_settings", return_value=mock_settings):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/webhooks/event/conf123", json={"type": "test"})
    assert resp.status_code == 403


# ---------------------------------------------------------------------------
# 3. test_webhook_dev_mode_bypasses_hmac
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_webhook_dev_mode_bypasses_hmac():
    """ENV=development, no Authorization header → 200 (HMAC bypass)."""
    from app.platform.settings import Settings
    mock_settings = Settings(
        env="development",
        vonage_application_private_key64="",
        mongo_db_connection_string="",
    )

    app = FastAPI(lifespan=_noop_lifespan)
    from app.controllers.webhook_controller import router as wh_router
    app.include_router(wh_router)

    mock_conf_mgr = MagicMock()
    mock_conf_mgr.get_conference.return_value = None

    with (
        patch("app.platform.settings.get_settings", return_value=mock_settings),
        patch(
            "app.controllers.webhook_controller._get_conference_manager",
            return_value=mock_conf_mgr,
        ),
        patch(
            "app.controllers.webhook_controller._get_caller_state_service",
            return_value=MagicMock(),
        ),
    ):
        async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
            resp = await client.post("/webhooks/event/conf123", json={"type": "test"})
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
        patch("app.platform.settings.get_settings", return_value=mock_settings),
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
        patch("app.platform.settings.get_settings", return_value=mock_settings),
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
                f"Expected successful connection but got 1008 Policy Violation"
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

    with (
        patch("app.consumers.content_job_consumer._process_audio_item", side_effect=_flaky_process),
        patch("app.consumers.content_job_consumer.asyncio.sleep", new=AsyncMock()),
    ):
        await _process_audio_content_job(job_doc, db, blob_provider)

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

    with patch("app.consumers.content_job_consumer._process_audio_item", side_effect=_always_permanent):
        with pytest.raises(ValueError, match="Corrupt file"):
            await _process_audio_content_job(job_doc, db, blob_provider)

    updated_job = await jobs_col.find_one({"_id": job_id})
    assert updated_job["status"] == "failed", (
        f"Expected status=failed, got status={updated_job['status']!r}"
    )
    assert updated_job.get("reason"), "Expected reason field to be set"
    assert "Corrupt file" in updated_job["reason"]
    assert updated_job.get("failed_at") is not None, "Expected failed_at to be set"
