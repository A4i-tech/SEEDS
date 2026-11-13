from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Response

from app.controllers.tenant_auth_controller import tenant_logout
from app.models.user import UserCreate, UserRole
from app.platform.auth.hashing import hash_password
from app.platform.settings import Settings
from app.platform.telemetry import configure_telemetry
from app.repositories.user_refresh_token_repository import UserRefreshTokenRepository
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from tests.support.mongomock_async import AsyncMongoMockClient


def _stored_token_id(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


@pytest.fixture(autouse=True)
def _telemetry():
    configure_telemetry(Settings(secret_key="test-secret-key-for-tests-32chars!!"))


@pytest.mark.asyncio
async def test_tenant_logout_revokes_other_active_sessions(mock_db):
    user = await UserRepository(mock_db).create(
        UserCreate(
            role=UserRole.TENANT,
            name="Tenant One",
            email="tenant@example.com",
            hashed_password=hash_password("correct-horse"),
        )
    )
    owner_id = str(user.id)

    repo = UserRefreshTokenRepository(mock_db)
    now = datetime.now(tz=UTC)
    for raw_token in ("other-session-raw-token", "this-session-raw-token"):
        await repo.insert(
            token_id=raw_token,
            owner_id=owner_id,
            claims={"role": "tenant", "tenant_id": owner_id, "school_id": ""},
            expires_at=now + timedelta(days=30),
            family_expires_at=now + timedelta(days=30),
            created_at=now,
        )

    await tenant_logout(Response(), "this-session-raw-token", service=AuthService(mock_db))

    other_doc = await mock_db["userRefreshTokens"].find_one(
        {"token_id": _stored_token_id("other-session-raw-token")}
    )
    assert other_doc["revoked"] is True
    assert other_doc["revoked_reason"] == "logout"
