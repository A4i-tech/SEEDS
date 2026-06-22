"""
Integration tests for ConferenceV2 migration — Phase 9.

Uses mongomock-motor to avoid needing a real MongoDB instance.
Uses httpx.AsyncClient with the FastAPI app to test HTTP layer.

Coverage:
  - test_create_conference_requires_teacher: tenant token → 403
  - test_create_conference_success: teacher token → 201 with conference_id
  - test_end_conference_requires_owner: different teacher → 403
  - test_add_participant_requires_owner: non-owner → 403
  - test_webhook_event_dispatch: POST /webhooks/event/{id}
  - test_playback_play_requires_owner
  - test_mute_all_requires_owner
"""

from __future__ import annotations

import os

# Set minimal env vars before app imports resolve settings
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")
os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "")
os.environ.setdefault("DB_CONNECTION", "")

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient
from unittest.mock import AsyncMock, MagicMock, patch

from app.main import app
from app.platform.auth.dependencies import get_db
from app.platform.auth.jwt import create_access_token
from app.models.user import UserRole


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def mock_db():
    """Return a mongomock-motor in-memory database."""
    client = AsyncMongoMockClient()
    db = client["seeds_test"]
    yield db
    client.close()


def _make_mock_conference_manager():
    """Return a mock ConferenceCallManager."""
    mgr = MagicMock()
    mgr.get_conference = MagicMock(return_value=None)
    mgr.create_conference = AsyncMock()
    mgr.start_conference_call = AsyncMock()
    mgr.delete_conference = MagicMock()
    mgr.get_conference_from_phone_number = MagicMock(return_value=None)
    return mgr


@pytest_asyncio.fixture
async def mock_conf_mgr():
    return _make_mock_conference_manager()


@pytest_asyncio.fixture
async def client(mock_db, mock_conf_mgr):
    """Return an httpx AsyncClient wired to the FastAPI app with mock DB and conference manager."""
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db

    with patch("app.platform.lifespan.get_conference_manager", return_value=mock_conf_mgr):
        with patch("app.controllers.conference_controller.get_conference_manager", return_value=mock_conf_mgr):
            with patch("app.controllers.playback_controller._get_conference_manager", return_value=mock_conf_mgr):
                with patch("app.controllers.participants_controller._get_conference_manager", return_value=mock_conf_mgr):
                    with patch("app.controllers.webhook_controller.get_conference_manager", return_value=mock_conf_mgr):
                        with patch("app.controllers.websocket_controller._get_conference_manager", return_value=mock_conf_mgr):
                            transport = ASGITransport(app=app)
                            async with AsyncClient(transport=transport, base_url="http://test") as ac:
                                yield ac, mock_conf_mgr

    app.dependency_overrides.clear()


def _teacher_token(sub: str = "teacher-uid-1") -> str:
    return create_access_token({"sub": sub, "role": "teacher"})


def _tenant_token(sub: str = "tenant-uid-1") -> str:
    return create_access_token({"sub": sub, "role": "tenant"})


def _teacher2_token(sub: str = "teacher-uid-2") -> str:
    return create_access_token({"sub": sub, "role": "teacher"})


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_create_conference_requires_teacher(client):
    ac, mgr = client
    resp = await ac.post(
        "/conference/create",
        json={"teacher_phone": "+911234567890", "student_phones": []},
        headers={"Authorization": f"Bearer {_tenant_token()}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_create_conference_success(client, mock_db):
    ac, mgr = client

    # Setup mock return value
    mock_conf = MagicMock()
    mock_conf.conf_id = "test-conf-uuid-123"
    mgr.create_conference.return_value = mock_conf

    resp = await ac.post(
        "/conference/create",
        json={"teacher_phone": "+911234567890", "student_phones": ["+919876543210"]},
        headers={"Authorization": f"Bearer {_teacher_token()}"},
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["status"] == "CREATED"
    assert "id" in body
    assert body["id"] == "test-conf-uuid-123"


@pytest.mark.asyncio
async def test_end_conference_requires_owner(client, mock_db):
    """A different teacher should get 403 when trying to end a conference they don't own."""
    ac, mgr = client

    # Insert a conference owned by teacher-uid-1
    await mock_db["conferences"].insert_one({
        "_id": "conf-abc",
        "created_by": "teacher-uid-1",
        "teacher_phone": "+911234567890",
    })

    # teacher-uid-2 tries to end it
    resp = await ac.put(
        "/conference/end/conf-abc",
        headers={"Authorization": f"Bearer {_teacher2_token()}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_end_conference_requires_owner_unauthenticated(client):
    ac, mgr = client
    resp = await ac.put("/conference/end/conf-xyz")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_add_participant_requires_owner(client, mock_db):
    """Non-owner teacher should get 403."""
    ac, mgr = client

    await mock_db["conferences"].insert_one({
        "_id": "conf-def",
        "created_by": "teacher-uid-1",
        "teacher_phone": "+911234567890",
    })

    resp = await ac.put(
        "/conference/addparticipant/conf-def",
        params={"phone_number": "+9100000000"},
        headers={"Authorization": f"Bearer {_teacher2_token()}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_webhook_event_dispatch(client, mock_db):
    """Webhook endpoint should accept events and return ok without auth."""
    ac, mgr = client

    # Conference not found returns ok (webhook processes in background)
    resp = await ac.post(
        "/webhooks/event/nonexistent-conf",
        json={
            "status": "answered",
            "to": "+911234567890",
            "from": "+910000000000",
            "uuid": "call-leg-uuid-123",
            "conversation_uuid": "conv-uuid-123",
        },
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_webhook_get_event_health(client):
    """GET /webhooks/event should return 200."""
    ac, mgr = client
    resp = await ac.get("/webhooks/event")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_playback_play_requires_owner(client, mock_db):
    """Non-owner should get 403 for playback operations."""
    ac, mgr = client

    await mock_db["conferences"].insert_one({
        "_id": "conf-play",
        "created_by": "teacher-uid-1",
        "teacher_phone": "+911234567890",
    })

    resp = await ac.put(
        "/conference/playaudio/conf-play",
        params={"url": "https://example.com/audio.wav"},
        headers={"Authorization": f"Bearer {_teacher2_token()}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_mute_all_requires_owner(client, mock_db):
    """Non-owner should get 403 for mute operations."""
    ac, mgr = client

    await mock_db["conferences"].insert_one({
        "_id": "conf-mute",
        "created_by": "teacher-uid-1",
        "teacher_phone": "+911234567890",
    })

    resp = await ac.put(
        "/conference/muteall/conf-mute",
        headers={"Authorization": f"Bearer {_teacher2_token()}"},
    )
    assert resp.status_code == 403


@pytest.mark.asyncio
async def test_conversation_events_webhook_accepts(client):
    """POST /webhooks/conversationevents should accept any payload."""
    ac, mgr = client
    resp = await ac.post(
        "/webhooks/conversationevents",
        json={"type": "audio:dtmf", "body": {"digit": "0"}},
    )
    assert resp.status_code == 200
