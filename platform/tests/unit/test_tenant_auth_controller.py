from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from fastapi import Response

from app.controllers.tenant_auth_controller import tenant_logout
from app.models.user import UserCreate, UserRole
from app.platform.auth.hashing import hash_password
from app.platform.auth.jwt import create_access_token
from app.platform.settings import Settings
from app.platform.telemetry import configure_telemetry
from app.repositories.user_refresh_token_repository import UserRefreshTokenRepository
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from tests.support.mongomock_async import AsyncMongoMockClient


def _stored_token_id(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


class _FakeRequest:
    def __init__(self) -> None:
        self.cookies: dict[str, str] = {}


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


@pytest.fixture(autouse=True)
def _telemetry():
    configure_telemetry(Settings(secret_key="test-secret-key-for-tests-32chars!!"))


@pytest.mark.asyncio
async def test_tenant_logout_bearer_fallback_revokes_other_active_sessions(mock_db):
    user = await UserRepository(mock_db).create(
        UserCreate(
            role=UserRole.TENANT,
            name="Tenant One",
            email="tenant@example.com",
            hashed_password=hash_password("correct-horse"),
        )
    )
    owner_id = str(user.id)

    other_session_repo = UserRefreshTokenRepository(mock_db)
    now = datetime.now(tz=UTC)
    await other_session_repo.insert(
        token_id="other-session-raw-token",
        owner_id=owner_id,
        claims={"role": "tenant", "tenant_id": None, "school_id": None},
        expires_at=now + timedelta(days=30),
        family_expires_at=now + timedelta(days=30),
        created_at=now,
    )

    token = create_access_token({"sub": owner_id, "role": "tenant"})
    service = AuthService(mock_db)

    await tenant_logout(_FakeRequest(), Response(), token=token, service=service)

    other_doc = await mock_db["userRefreshTokens"].find_one(
        {"token_id": _stored_token_id("other-session-raw-token")}
    )
    assert other_doc["revoked"] is True
    assert other_doc["revoked_reason"] == "logout"
