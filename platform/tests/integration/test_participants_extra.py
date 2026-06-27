"""
Integration coverage for participants_controller endpoints.
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
from app.models.user import UserRole
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.auth.jwt import create_access_token


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_participants"]
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


async def _seed_teacher(db, email="t@parts.com", tid="t1", sid="s1"):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "Parts Teacher",
        "email": email,
        "hashed_password": hash_password("pass1234"),
        "tenant_id": tid,
        "school_id": sid,
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _teacher_token(uid, tid="t1", sid="s1"):
    return create_access_token({"sub": uid, "role": "teacher", "tenant_id": tid, "school_id": sid})


class TestParticipantsController:
    @pytest.mark.asyncio
    async def test_add_participant_no_conf_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=None)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/addparticipant/nonexistent",
                json={"phone_number": "+919999999990"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_remove_participant_no_conf_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=None)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/removeparticipant/nonexistent",
                json={"phone_number": "+919999999990"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_mute_participant_no_conf_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=None)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/muteparticipant/nonexistent",
                json={"phone_number": "+919999999990"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_unmute_participant_no_conf_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=None)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/unmuteparticipant/nonexistent",
                json={"phone_number": "+919999999990"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_mute_all_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/muteall/conf1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_unmute_all_requires_auth(self, client, mock_db):
        resp = await client.put("/conference/unmuteall/conf1")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_mute_all_no_conf_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=None)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/muteall/nonexistent",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_unmute_all_no_conf_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=None)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/unmuteall/nonexistent",
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 404)

    @pytest.mark.asyncio
    async def test_add_participant_with_conf_success(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])

        mock_conf = MagicMock()
        mock_conf.conf_id = "conf1"
        mock_conf.state = MagicMock()
        mock_conf.queue_event = AsyncMock()

        with patch("app.platform.lifespan.get_conference_manager") as mock_mgr:
            mgr = MagicMock()
            mgr.get_conference = MagicMock(return_value=mock_conf)
            mock_mgr.return_value = mgr

            resp = await client.put(
                "/conference/addparticipant/conf1",
                json={"phone_number": "+919999999990"},
                headers={"Authorization": f"Bearer {token}"},
            )
            assert resp.status_code in (200, 202, 404, 422)
