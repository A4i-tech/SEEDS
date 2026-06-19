"""
Extra integration tests for participants_controller covering all endpoints.
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
    db = client["seeds_test_participants_v2"]
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


async def _seed_teacher(db, email="pt2@test.com", tid="t1", sid="s1"):
    doc = {
        "role": UserRole.TEACHER.value,
        "name": "PT2 Teacher",
        "email": email,
        "hashed_password": hash_password("pass"),
        "tenant_id": tid,
        "school_id": sid,
        "is_active": True,
    }
    result = await db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


async def _seed_conference(db, conf_id: str, created_by: str, tenant_id: str = "t1"):
    doc = {"_id": conf_id, "created_by": created_by, "tenant_id": tenant_id}
    await db["conferences"].insert_one(doc)
    return doc


def _make_mock_conf():
    mock_conf = MagicMock()
    mock_conf.queue_event = AsyncMock()
    mock_conf.state = MagicMock()
    mock_conf.state.get_teacher = MagicMock(return_value=MagicMock())
    return mock_conf


def _make_mock_mgr(conf=None):
    mock_mgr = MagicMock()
    mock_mgr.get_conference = MagicMock(return_value=conf)
    return mock_mgr


def _teacher_token(uid, tid="t1", sid="s1"):
    return create_access_token({"sub": uid, "role": "teacher", "tenant_id": tid, "school_id": sid})


class TestParticipantsControllerV2:
    @pytest.mark.asyncio
    async def test_add_participant_no_conf_db_404(self, client, mock_db):
        teacher = await _seed_teacher(mock_db)
        token = _teacher_token(teacher["_id"])
        # No conference in DB → 404 from require_conference_owner
        resp = await client.put(
            "/conference/addparticipant/no_conf_id",
            params={"phone_number": "+919999999990"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_add_participant_success(self, client, mock_db):
        teacher = await _seed_teacher(mock_db, "add_p@test.com")
        token = _teacher_token(teacher["_id"])
        await _seed_conference(mock_db, "conf_add", teacher["_id"])

        mock_conf = _make_mock_conf()
        mock_mgr = _make_mock_mgr(conf=mock_conf)
        with patch("app.platform.lifespan.get_conference_manager", return_value=mock_mgr):
            resp = await client.put(
                "/conference/addparticipant/conf_add",
                params={"phone_number": "+919999999990", "name": "Student"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200
        assert resp.json()["message"] == "Event Queued for execution"

    @pytest.mark.asyncio
    async def test_remove_participant_success(self, client, mock_db):
        teacher = await _seed_teacher(mock_db, "rem_p@test.com")
        token = _teacher_token(teacher["_id"])
        await _seed_conference(mock_db, "conf_rem", teacher["_id"])

        mock_conf = _make_mock_conf()
        mock_mgr = _make_mock_mgr(conf=mock_conf)
        with patch("app.platform.lifespan.get_conference_manager", return_value=mock_mgr):
            resp = await client.put(
                "/conference/removeparticipant/conf_rem",
                params={"phone_number": "+919999999990"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_mute_participant_success(self, client, mock_db):
        teacher = await _seed_teacher(mock_db, "mute_p@test.com")
        token = _teacher_token(teacher["_id"])
        await _seed_conference(mock_db, "conf_mute", teacher["_id"])

        mock_conf = _make_mock_conf()
        mock_mgr = _make_mock_mgr(conf=mock_conf)
        with patch("app.platform.lifespan.get_conference_manager", return_value=mock_mgr):
            resp = await client.put(
                "/conference/muteparticipant/conf_mute",
                params={"phone_number": "+919999999990"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_unmute_participant_success(self, client, mock_db):
        teacher = await _seed_teacher(mock_db, "unmute_p@test.com")
        token = _teacher_token(teacher["_id"])
        await _seed_conference(mock_db, "conf_unmute", teacher["_id"])

        mock_conf = _make_mock_conf()
        mock_mgr = _make_mock_mgr(conf=mock_conf)
        with patch("app.platform.lifespan.get_conference_manager", return_value=mock_mgr):
            resp = await client.put(
                "/conference/unmuteparticipant/conf_unmute",
                params={"phone_number": "+919999999990"},
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_mute_all_success(self, client, mock_db):
        teacher = await _seed_teacher(mock_db, "muteall_p@test.com")
        token = _teacher_token(teacher["_id"])
        await _seed_conference(mock_db, "conf_muteall", teacher["_id"])

        mock_conf = _make_mock_conf()
        mock_mgr = _make_mock_mgr(conf=mock_conf)
        with patch("app.platform.lifespan.get_conference_manager", return_value=mock_mgr):
            resp = await client.put(
                "/conference/muteall/conf_muteall",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_mute_all_no_teacher_403(self, client, mock_db):
        teacher = await _seed_teacher(mock_db, "muteall_nt@test.com")
        token = _teacher_token(teacher["_id"])
        await _seed_conference(mock_db, "conf_muteall_nt", teacher["_id"])

        mock_conf = _make_mock_conf()
        mock_conf.state.get_teacher = MagicMock(return_value=None)
        mock_mgr = _make_mock_mgr(conf=mock_conf)
        with patch("app.platform.lifespan.get_conference_manager", return_value=mock_mgr):
            resp = await client.put(
                "/conference/muteall/conf_muteall_nt",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_unmute_all_success(self, client, mock_db):
        teacher = await _seed_teacher(mock_db, "unmuteall_p@test.com")
        token = _teacher_token(teacher["_id"])
        await _seed_conference(mock_db, "conf_unmuteall", teacher["_id"])

        mock_conf = _make_mock_conf()
        mock_mgr = _make_mock_mgr(conf=mock_conf)
        with patch("app.platform.lifespan.get_conference_manager", return_value=mock_mgr):
            resp = await client.put(
                "/conference/unmuteall/conf_unmuteall",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_unmute_all_no_teacher_403(self, client, mock_db):
        teacher = await _seed_teacher(mock_db, "unmuteall_nt@test.com")
        token = _teacher_token(teacher["_id"])
        await _seed_conference(mock_db, "conf_unmuteall_nt", teacher["_id"])

        mock_conf = _make_mock_conf()
        mock_conf.state.get_teacher = MagicMock(return_value=None)
        mock_mgr = _make_mock_mgr(conf=mock_conf)
        with patch("app.platform.lifespan.get_conference_manager", return_value=mock_mgr):
            resp = await client.put(
                "/conference/unmuteall/conf_unmuteall_nt",
                headers={"Authorization": f"Bearer {token}"},
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_get_conf_helper_not_found(self, client, mock_db):
        """Direct unit test for _get_conf_or_404."""
        from app.controllers.participants_controller import _get_conf_or_404
        from fastapi import HTTPException

        mock_mgr = _make_mock_mgr(conf=None)
        with patch("app.controllers.participants_controller._get_conference_manager", return_value=mock_mgr):
            with pytest.raises(HTTPException) as exc_info:
                _get_conf_or_404("nonexistent")
            assert exc_info.value.status_code == 404
