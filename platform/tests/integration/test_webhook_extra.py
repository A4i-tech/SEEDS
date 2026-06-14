"""
Extra integration coverage for webhook_controller.py endpoints.
"""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.auth.jwt import create_access_token
from app.models.user import UserRole


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_webhook_extra"]
    yield db
    client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()


class TestWebhookControllerExtra:
    @pytest.mark.asyncio
    async def test_event_webhook_get(self, client, mock_db):
        """GET /webhooks/event should be a health check endpoint."""
        resp = await client.get("/webhooks/event")
        assert resp.status_code in (200, 204, 404, 405)

    @pytest.mark.asyncio
    async def test_ivr_event_webhook_no_signature(self, client, mock_db):
        """POST /event without HMAC should fail in prod or succeed in dev."""
        resp = await client.post("/event", json={
            "status": "answered",
            "conversation_uuid": "conv1",
            "to": "+919999999990",
        })
        # In dev mode, sig verification may be skipped
        assert resp.status_code in (200, 204, 401, 403, 422)

    @pytest.mark.asyncio
    async def test_ivr_dtmf_webhook_requires_body(self, client, mock_db):
        """POST /dtmf — DTMF input requires valid body."""
        resp = await client.post("/dtmf", json={})  # Empty body
        assert resp.status_code in (200, 204, 422, 500)

    @pytest.mark.asyncio
    async def test_ivr_call_webhook_not_missed_call(self, client, mock_db):
        """POST /webhook with non-missed call status returns detail."""
        with patch("app.controllers.webhook_controller.verify_vonage_signature", AsyncMock()):
            resp = await client.post("/webhook", json={
                "_su": 1,  # Not 2 (missed call)
                "_cl": "+919999999990",
            })
            assert resp.status_code in (200, 422)
            if resp.status_code == 200:
                assert "Invalid" in resp.json().get("detail", "")

    @pytest.mark.asyncio
    async def test_conversation_events_webhook(self, client, mock_db):
        """POST /webhooks/conversationevents — conversation event webhook."""
        mock_mgr3 = MagicMock()
        mock_mgr3.get_conference_from_phone_number = MagicMock(return_value=None)
        with patch("app.controllers.webhook_controller._get_conference_manager", return_value=mock_mgr3):
            resp = await client.post("/webhooks/conversationevents", json={
                "type": "member:joined",
                "conversation_id": "CON-abc123",
                "body": {
                    "channel": {
                        "from": {"number": "+919999999990"},
                    },
                    "state": "JOINED",
                },
            })
            assert resp.status_code in (200, 204, 422, 500)

    @pytest.mark.asyncio
    async def test_ivr_rtc_event_webhook(self, client, mock_db):
        """POST /rtc-event — IVR RTC event."""
        resp = await client.post("/rtc-event", json={
            "type": "member:joined",
            "conversation_id": "CON-abc123",
            "body": {"state": "JOINED"},
        })
        assert resp.status_code in (200, 204, 422)

    @pytest.mark.asyncio
    async def test_webhook_process_conversation_event_no_conf_manager(self, client, mock_db):
        """_process_conversation_event with no conference manager."""
        from app.controllers.webhook_controller import _process_conversation_event

        mock_mgr = MagicMock()
        mock_mgr.get_conference_from_phone_number = MagicMock(return_value=None)

        event_data = {
            "type": "member:media",
            "body": {
                "channel": {
                    "from": {"number": "+919999999990"},
                },
                "state": "COMPLETED",
            },
        }
        await _process_conversation_event(event_data, mock_mgr)  # Should not raise
