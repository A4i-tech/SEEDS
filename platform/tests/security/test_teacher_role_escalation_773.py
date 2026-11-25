"""Regression tests for A4i-tech/.github#773: teacher registration role escalation."""

from __future__ import annotations

import pytest
import pytest_asyncio
from bson import ObjectId
from httpx import ASGITransport, AsyncClient
from jose import jwt as jose_jwt

from app.main import app
from app.models.user import UserCreate, UserRole
from app.platform.auth.dependencies import get_db
from app.platform.auth.hashing import hash_password
from app.platform.auth.jwt import create_access_token
from app.platform.auth.refresh_tokens import issue_pair
from app.platform.error_handling import AppError, UnauthorizedError, ValidationError
from app.platform.settings import get_settings
from app.repositories.user_refresh_token_repository import UserRefreshTokenRepository
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService, TeacherCreate
from tests.support.mongomock_async import AsyncMongoMockClient

TENANT_ID = str(ObjectId())
SCHOOL_ID = str(ObjectId())
PASSWORD = "Passw0rd!"
DISALLOWED_ROLES = [
    "tenant",
    "school_admin",
    "student",
    "textbook_remediation_volunteer",
    "superadmin",
]


@pytest_asyncio.fixture
async def mock_db():
    client = AsyncMongoMockClient()
    yield client["seeds_test"]
    await client.close()


@pytest_asyncio.fixture
async def client(mock_db):
    async def _override_db():
        yield mock_db

    app.dependency_overrides[get_db] = _override_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="https://test") as ac:
        yield ac
    app.dependency_overrides.clear()


def _school_admin_headers() -> dict[str, str]:
    token = create_access_token(
        {"sub": SCHOOL_ID, "role": "school_admin", "school_id": SCHOOL_ID, "tenant_id": TENANT_ID}
    )
    return {"Authorization": f"Bearer {token}"}


def _claims(token: str) -> dict:
    return jose_jwt.decode(
        token, get_settings().secret_key, algorithms=["HS256"], issuer="platform"
    )


async def _seed(mock_db, role: UserRole, phone: str, **extra) -> str:
    user = await UserRepository(mock_db).create(
        UserCreate(
            role=role,
            name=role.value,
            hashed_password=await hash_password(PASSWORD),
            phone=phone,
            **extra,
        )
    )
    return str(user.id)


async def _seed_escalated_tenant(mock_db, email: str) -> str:
    """Account shape produced by /teacher/register with role=tenant before the fix."""
    return await _seed(
        mock_db, UserRole.TENANT, email, email=email, tenant_id=TENANT_ID, school_id=SCHOOL_ID
    )


class TestRegisterEndpointRoles:
    @pytest.mark.parametrize("role", DISALLOWED_ROLES)
    async def test_disallowed_role_is_rejected_and_not_persisted(self, client, mock_db, role):
        resp = await client.post(
            "/teacher/register",
            json={"phone_number": "+915550000001", "password": PASSWORD, "name": "X", "role": role},
            headers=_school_admin_headers(),
        )

        assert resp.status_code == 422
        assert await mock_db["users"].count_documents({}) == 0

    @pytest.mark.parametrize("role", ["teacher", "content_creator"])
    async def test_allowed_role_registers_in_admin_school(self, client, mock_db, role):
        resp = await client.post(
            "/teacher/register",
            json={"phone_number": "+915550000002", "password": PASSWORD, "name": "Y", "role": role},
            headers=_school_admin_headers(),
        )

        assert resp.status_code == 201
        stored = await mock_db["users"].find_one({"phone": "+915550000002"})
        assert stored["role"] == role
        assert str(stored["tenant_id"]) == TENANT_ID
        assert str(stored["school_id"]) == SCHOOL_ID


class TestRegisterServiceRoles:
    @pytest.mark.parametrize("role", DISALLOWED_ROLES)
    async def test_service_rejects_disallowed_role(self, mock_db, role):
        data = TeacherCreate(name="Z", email="+915550000003", password=PASSWORD, role=role)

        with pytest.raises(ValidationError):
            await AuthService(mock_db).register_teacher(data)

        assert await mock_db["users"].count_documents({}) == 0


class TestTeacherPhoneLogin:
    @pytest.mark.parametrize("role", [UserRole.TENANT, UserRole.SCHOOL_ADMIN])
    async def test_non_teacher_account_cannot_log_in_by_phone(self, mock_db, role):
        await _seed(mock_db, role, "+915550000004", tenant_id=TENANT_ID, school_id=SCHOOL_ID)

        with pytest.raises(UnauthorizedError, match="Invalid phone or password"):
            await AuthService(mock_db).login_by_phone("+915550000004", PASSWORD)

        assert await mock_db["userRefreshTokens"].count_documents({}) == 0

    async def test_escalated_tenant_gets_401_from_teacher_login(self, client, mock_db):
        await _seed_escalated_tenant(mock_db, "+915550000005")

        resp = await client.post(
            "/teacher/login", json={"phone_number": "+915550000005", "password": PASSWORD}
        )

        assert resp.status_code == 401

    @pytest.mark.parametrize("role", [UserRole.TEACHER, UserRole.CONTENT_CREATOR])
    async def test_teacher_roles_still_log_in_by_phone(self, mock_db, role):
        await _seed(mock_db, role, "+915550000006", tenant_id=TENANT_ID, school_id=SCHOOL_ID)

        result = await AuthService(mock_db).login_by_phone("+915550000006", PASSWORD)

        assert _claims(result["access_token"])["role"] == role.value


class TestLegitimateTenant:
    async def test_register_login_refresh_keep_tenant_scope(self, client):
        registered = await client.post(
            "/tenant/register",
            json={"email": "owner@org.example", "password": PASSWORD, "tenant_name": "Org"},
        )
        login = await client.post(
            "/auth/login", json={"identifier": "owner@org.example", "password": PASSWORD}
        )
        refreshed = await client.post("/auth/token/refresh")

        assert registered.status_code == 201
        assert login.status_code == 200
        assert refreshed.status_code == 200
        tenant_id = registered.json()["id"]
        for token in (login.json()["token"], refreshed.json()["access_token"]):
            claims = _claims(token)
            assert claims["role"] == "tenant"
            assert claims["tenant_id"] == tenant_id


class TestPreExistingEscalatedAccounts:
    """Accounts escalated before the fix still hold role=tenant in the database.

    Blocking them needs production audit evidence (tenant_audit_773.js) and a
    product decision on how to identify or remediate them; see AUDIT_773.md.
    """

    @pytest.mark.xfail(
        strict=True, reason="#773: needs production audit before guarding email login"
    )
    async def test_escalated_tenant_with_at_sign_email_cannot_use_email_login(self, mock_db):
        await _seed_escalated_tenant(mock_db, "escalated@school.example")

        with pytest.raises(UnauthorizedError):
            await AuthService(mock_db).login_unified(
                "escalated@school.example", PASSWORD, is_email=True
            )

    @pytest.mark.xfail(strict=True, reason="#773: needs production audit before guarding refresh")
    async def test_escalated_tenant_refresh_token_cannot_mint_tenant_jwt(self, mock_db):
        user_id = await _seed_escalated_tenant(mock_db, "+915550000008")
        claims = {"role": "tenant", "tenant_id": TENANT_ID, "school_id": SCHOOL_ID}
        pair = await issue_pair(
            UserRefreshTokenRepository(mock_db),
            owner_id=user_id,
            claims=claims,
            access_token="pre-fix-access-token",
            access_expires_in=3600,
            refresh_ttl="30d",
        )

        with pytest.raises(AppError):
            await AuthService(mock_db).refresh(pair["refresh_token"])
