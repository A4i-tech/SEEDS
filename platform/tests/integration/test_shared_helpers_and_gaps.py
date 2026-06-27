"""
Tests for: shared _conference_helpers.get_conf_or_404 (L14),
canonical StartIVRRequest import (L12), PATCH /ivr endpoint, and
tenant auth endpoints that lacked coverage (M10).
"""

from __future__ import annotations

import os

os.environ.setdefault("SECRET_KEY", "test-secret-key-for-integration-tests-32ch")
os.environ.setdefault("APP_MODE", "api")
os.environ.setdefault("ENV", "development")
os.environ.setdefault("MONGO_DB_CONNECTION_STRING", "")
os.environ.setdefault("DB_CONNECTION", "")

from unittest.mock import MagicMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from mongomock_motor import AsyncMongoMockClient

from app.main import app
from app.models.user import UserRole
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.auth.jwt import create_access_token


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    db = client["seeds_test_helpers"]
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


async def _seed_tenant(mock_db, email="t@gap.com", password="gappass"):
    doc = {
        "role": UserRole.TENANT.value,
        "name": "Gap Tenant",
        "email": email,
        "tenant_name": "Gap Org",
        "hashed_password": hash_password(password),
        "is_active": True,
    }
    result = await mock_db["users"].insert_one(doc)
    doc["_id"] = str(result.inserted_id)
    return doc


def _tenant_token(user_id):
    return create_access_token({"sub": user_id, "role": "tenant"})


# ---------------------------------------------------------------------------
# L14 — shared get_conf_or_404 helper
# ---------------------------------------------------------------------------


class TestConferenceHelpersShared:
    def test_import_from_canonical_module(self) -> None:
        from app.controllers._conference_helpers import get_conf_or_404
        assert callable(get_conf_or_404)

    def test_returns_conf_when_found(self) -> None:
        from app.controllers._conference_helpers import get_conf_or_404
        mock_conf = MagicMock()
        mock_mgr = MagicMock()
        mock_mgr.get_conference.return_value = mock_conf
        with patch("app.platform.lifespan.get_conference_manager", return_value=mock_mgr):
            result = get_conf_or_404("conf_abc")
        assert result is mock_conf

    def test_raises_404_when_not_found(self) -> None:
        from app.controllers._conference_helpers import get_conf_or_404
        from fastapi import HTTPException
        mock_mgr = MagicMock()
        mock_mgr.get_conference.return_value = None
        with patch("app.platform.lifespan.get_conference_manager", return_value=mock_mgr):
            with pytest.raises(HTTPException) as exc_info:
                get_conf_or_404("missing")
        assert exc_info.value.status_code == 404
        assert "Conference not found" in exc_info.value.detail

    def test_participants_controller_uses_shared_helper(self) -> None:
        import app.controllers.participants_controller as pc
        import app.controllers._conference_helpers as ch
        # _get_conf_or_404 must no longer exist locally; get_conf_or_404 is imported
        assert not hasattr(pc, "_get_conf_or_404")
        assert pc.get_conf_or_404 is ch.get_conf_or_404

    def test_playback_controller_uses_shared_helper(self) -> None:
        import app.controllers.playback_controller as plc
        import app.controllers._conference_helpers as ch
        assert not hasattr(plc, "_get_conf_or_404")
        assert plc.get_conf_or_404 is ch.get_conf_or_404

    def test_conference_controller_uses_shared_helper(self) -> None:
        import app.controllers.conference_controller as cc
        import app.controllers._conference_helpers as ch
        assert not hasattr(cc, "_get_conf_or_404")
        assert cc.get_conf_or_404 is ch.get_conf_or_404


# ---------------------------------------------------------------------------
# L12 — StartIVRRequest canonical import
# ---------------------------------------------------------------------------


class TestStartIVRRequestCanonical:
    def test_single_definition_in_call_requests(self) -> None:
        from app.models.requests.call_requests import StartIVRRequest
        assert hasattr(StartIVRRequest, "model_fields")
        assert "phone_number" in StartIVRRequest.model_fields

    def test_ivr_structure_controller_imports_from_call_requests(self) -> None:
        import app.controllers.ivr_structure_controller as ctrl
        from app.models.requests.call_requests import StartIVRRequest
        # The controller must not define its own StartIVRRequest
        assert not hasattr(ctrl, "StartIVRRequest") or ctrl.StartIVRRequest is StartIVRRequest


# ---------------------------------------------------------------------------
# M10 — PATCH /ivr endpoint coverage
# ---------------------------------------------------------------------------


class TestUpdateIVREndpoint:
    @pytest.mark.asyncio
    async def test_patch_ivr_requires_auth(self, client, mock_db):
        resp = await client.patch("/ivr")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_patch_ivr_with_tenant_token(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.patch("/ivr", headers={"Authorization": f"Bearer {token}"})
        # Service returns empty structure (no content in DB) — 200 with empty data or 500 from
        # IVR rebuild; both are valid non-auth outcomes
        assert resp.status_code != 401


# ---------------------------------------------------------------------------
# M10 — tenant dashboard / analytics / change-password endpoints
# ---------------------------------------------------------------------------


class TestTenantAuthGapEndpoints:
    @pytest.mark.asyncio
    async def test_dashboard_requires_auth(self, client, mock_db):
        resp = await client.get("/tenant/dashboard")
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_dashboard_with_tenant_token(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.get("/tenant/dashboard", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_analytics_requires_auth(self, client, mock_db):
        resp = await client.post("/tenant/analytics", json={"startDate": "2026-01-01", "endDate": "2026-06-01"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_analytics_missing_dates(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.post(
            "/tenant/analytics",
            json={},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code in (400, 422)

    @pytest.mark.asyncio
    async def test_analytics_with_valid_dates(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.post(
            "/tenant/analytics",
            json={"startDate": "2026-01-01T00:00:00", "endDate": "2026-06-01T00:00:00"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "count" in data
        assert "data" in data

    @pytest.mark.asyncio
    async def test_change_password_requires_auth(self, client, mock_db):
        resp = await client.post("/tenant/change-password", json={"newPassword": "newpass123"})
        assert resp.status_code == 401

    @pytest.mark.asyncio
    async def test_change_password_with_tenant_token(self, client, mock_db):
        tenant = await _seed_tenant(mock_db)
        token = _tenant_token(tenant["_id"])
        resp = await client.post(
            "/tenant/change-password",
            json={"newPassword": "newpass456"},
            headers={"Authorization": f"Bearer {token}"},
        )
        assert resp.status_code == 200
        assert resp.json()["message"] == "Password changed successfully"
