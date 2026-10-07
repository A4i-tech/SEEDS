from __future__ import annotations

import asyncio
import hashlib
from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt as jose_jwt

from app.models.user import UserCreate, UserRole
from app.platform.auth.hashing import hash_password
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.platform.telemetry import configure_telemetry
from app.repositories import user_refresh_token_repository
from app.repositories.user_repository import UserRepository
from app.services.auth_service import AuthService
from tests.support.mongomock_async import AsyncMongoMockClient


def _disable_replay_grace_window(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        user_refresh_token_repository, "REPLAY_GRACE_WINDOW", timedelta(seconds=-1)
    )


def _decode_access_token(token: str, settings: Settings) -> dict:
    return jose_jwt.decode(
        token,
        settings.secret_key,
        algorithms=["HS256"],
        issuer="platform",
    )


def _stored_token_id(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


@pytest.fixture(autouse=True)
def _telemetry():
    configure_telemetry(Settings(secret_key="test-secret-key-for-tests-32chars!!"))


async def _seed_tenant(mock_db, *, email: str = "tenant@example.com", password: str = "correct-horse") -> None:
    await UserRepository(mock_db).create(
        UserCreate(
            role=UserRole.TENANT,
            name="Tenant One",
            email=email,
            hashed_password=hash_password(password),
        )
    )


class TestLoginIssuesRefreshToken:
    async def test_native_login_returns_refresh_token_and_expires_in(self, mock_db):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)

        result = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )

        assert result["access_token"]
        assert result["refresh_token"]
        assert isinstance(result["expires_in"], int) and result["expires_in"] > 0

    async def test_refresh_token_persisted_in_user_refresh_tokens_collection(self, mock_db):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)

        result = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )

        stored = await mock_db["userRefreshTokens"].find_one({"token_id": _stored_token_id(result["refresh_token"])})
        assert stored is not None
        assert stored["revoked"] is False
        assert stored["claims"]["role"] == "tenant"


class TestRefreshSuccess:
    async def test_rotation_returns_new_pair_and_revokes_old(self, mock_db):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        old_refresh = issued["refresh_token"]

        result = await service.refresh(old_refresh)

        assert set(result.keys()) == {"access_token", "refresh_token", "expires_in", "token_type"}
        assert result["refresh_token"] != old_refresh

        old_doc = await mock_db["userRefreshTokens"].find_one({"token_id": _stored_token_id(old_refresh)})
        assert old_doc["revoked"] is True

        new_doc = await mock_db["userRefreshTokens"].find_one({"token_id": _stored_token_id(result["refresh_token"])})
        assert new_doc is not None
        assert new_doc["revoked"] is False

    async def test_old_refresh_token_unusable_after_rotation(self, mock_db, monkeypatch):
        _disable_replay_grace_window(monkeypatch)
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        old_refresh = issued["refresh_token"]

        await service.refresh(old_refresh)

        with pytest.raises(UnauthorizedError):
            await service.refresh(old_refresh)


class TestRefreshReuseDetection:
    async def test_replaying_revoked_token_revokes_all_tokens_for_owner(self, mock_db, monkeypatch):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        root_refresh = issued["refresh_token"]
        rotated = await service.refresh(root_refresh)
        _disable_replay_grace_window(monkeypatch)

        with pytest.raises(UnauthorizedError):
            await service.refresh(root_refresh)

        with pytest.raises(UnauthorizedError):
            await service.refresh(rotated["refresh_token"])

        docs = [doc async for doc in mock_db["userRefreshTokens"].find({"owner_id": issued["user"]["id"]})]
        assert len(docs) == 2
        assert all(doc["revoked"] is True for doc in docs)
        assert all(doc["revoked_reason"] == "consumed" for doc in docs)

    async def test_replay_revokes_other_families_for_same_owner(self, mock_db, monkeypatch):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        family_a = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        family_b = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )

        await service.refresh(family_a["refresh_token"])
        _disable_replay_grace_window(monkeypatch)

        with pytest.raises(UnauthorizedError):
            await service.refresh(family_a["refresh_token"])

        other_family_doc = await mock_db["userRefreshTokens"].find_one(
            {"token_id": _stored_token_id(family_b["refresh_token"])}
        )
        assert other_family_doc["revoked"] is True
        assert other_family_doc["revoked_reason"] == "consumed"


class TestRefreshConcurrency:
    async def test_concurrent_refresh_within_grace_window_both_get_winners_pair(self, mock_db):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        root_refresh = issued["refresh_token"]

        results = await asyncio.gather(
            service.refresh(root_refresh),
            service.refresh(root_refresh),
            return_exceptions=True,
        )

        successes = [r for r in results if not isinstance(r, BaseException)]
        failures = [r for r in results if isinstance(r, BaseException)]
        assert len(successes) == 2
        assert len(failures) == 0
        assert successes[0]["refresh_token"] == successes[1]["refresh_token"]


class TestRefreshExpired:
    async def test_expired_token_raises_distinct_error_code(self, mock_db):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )

        await mock_db["userRefreshTokens"].update_one(
            {"token_id": _stored_token_id(issued["refresh_token"])},
            {"$set": {"expires_at": datetime.now(tz=UTC) - timedelta(days=1)}},
        )

        with pytest.raises(AppError) as exc_info:
            await service.refresh(issued["refresh_token"])
        assert exc_info.value.code == "REFRESH_TOKEN_EXPIRED"
        assert exc_info.value.status_code == 401

    async def test_expired_unconsumed_token_does_not_trigger_mass_revocation(self, mock_db):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        expired = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        sibling = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )

        await mock_db["userRefreshTokens"].update_one(
            {"token_id": _stored_token_id(expired["refresh_token"])},
            {"$set": {"expires_at": datetime.now(tz=UTC) - timedelta(days=1)}},
        )

        with pytest.raises(AppError):
            await service.refresh(expired["refresh_token"])

        expired_doc = await mock_db["userRefreshTokens"].find_one({"token_id": _stored_token_id(expired["refresh_token"])})
        assert expired_doc["revoked"] is False

        sibling_doc = await mock_db["userRefreshTokens"].find_one({"token_id": _stored_token_id(sibling["refresh_token"])})
        assert sibling_doc["revoked"] is False


class TestRefreshUnknownOrInactiveOwner:
    async def test_unknown_token_raises_generic_unauthorized(self, mock_db):
        service = AuthService(mock_db)
        with pytest.raises(UnauthorizedError):
            await service.refresh("does-not-exist")

    async def test_inactive_user_rejected_at_refresh(self, mock_db):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )

        await mock_db["users"].update_one({"email": "tenant@example.com"}, {"$set": {"is_active": False}})

        with pytest.raises(AppError) as exc_info:
            await service.refresh(issued["refresh_token"])
        assert exc_info.value.code == "TENANT_NOT_ALLOWED"
        assert exc_info.value.status_code == 403


class TestLoginAccountEnumeration:

    async def test_inactive_account_wrong_password_and_disabled_raise_same_error(self, mock_db):
        await _seed_tenant(mock_db)
        await mock_db["users"].update_one({"email": "tenant@example.com"}, {"$set": {"is_active": False}})
        service = AuthService(mock_db)

        with pytest.raises(UnauthorizedError) as wrong_password_exc:
            await service.login_unified(
                identifier="tenant@example.com", password="not-the-password", is_email=True
            )
        with pytest.raises(UnauthorizedError) as disabled_exc:
            await service.login_unified(
                identifier="tenant@example.com", password="correct-horse", is_email=True
            )

        assert wrong_password_exc.value.message == disabled_exc.value.message
        assert wrong_password_exc.value.status_code == disabled_exc.value.status_code == 401

    async def test_inactive_phone_login_wrong_password_and_disabled_raise_same_error(self, mock_db):
        await UserRepository(mock_db).create(
            UserCreate(
                role=UserRole.TEACHER,
                name="Teacher",
                phone="+15550002222",
                hashed_password=hash_password("teacher-pass"),
                is_active=False,
            )
        )
        service = AuthService(mock_db)

        with pytest.raises(UnauthorizedError) as wrong_password_exc:
            await service.login_by_phone("+15550002222", "not-the-password")
        with pytest.raises(UnauthorizedError) as disabled_exc:
            await service.login_by_phone("+15550002222", "teacher-pass")

        assert wrong_password_exc.value.message == disabled_exc.value.message
        assert wrong_password_exc.value.status_code == disabled_exc.value.status_code == 401


class TestSchoolAdminAndPhoneLoginAlsoIssueRefreshTokens:
    async def test_school_admin_login_returns_refresh_token(self, mock_db):
        await UserRepository(mock_db).create(
            UserCreate(
                role=UserRole.SCHOOL_ADMIN,
                name="Admin",
                email="admin@example.com",
                hashed_password=hash_password("admin-pass"),
                school_id="school-1",
                tenant_id="tenant-1",
            )
        )
        service = AuthService(mock_db)

        result = await service.login_unified(
            identifier="admin@example.com", password="admin-pass", is_email=True
        )

        assert result["access_token"]
        assert result["refresh_token"]
        assert isinstance(result["expires_in"], int)

    async def test_phone_login_returns_refresh_token(self, mock_db):
        await UserRepository(mock_db).create(
            UserCreate(
                role=UserRole.TEACHER,
                name="Teacher",
                phone="+15550001111",
                hashed_password=hash_password("teacher-pass"),
            )
        )
        service = AuthService(mock_db)

        result = await service.login_by_phone("+15550001111", "teacher-pass")

        assert result["access_token"]
        assert result["refresh_token"]
        assert isinstance(result["expires_in"], int)


class TestLogoutRevocation:
    async def test_logout_revoked_token_replay_does_not_trigger_reuse_alarm(self, mock_db, caplog):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        owner_id = issued["user"]["id"]

        await service.logout(owner_id)

        doc = await mock_db["userRefreshTokens"].find_one({"token_id": _stored_token_id(issued["refresh_token"])})
        assert doc["revoked"] is True
        assert doc["revoked_reason"] == "logout"

        with caplog.at_level("WARNING"):
            with pytest.raises(UnauthorizedError):
                await service.refresh(issued["refresh_token"])

        assert not any(
            getattr(record, "event", None) == "refresh_token_reuse_detected" for record in caplog.records
        )

    async def test_consumed_token_replay_still_triggers_reuse_alarm(self, mock_db, caplog, monkeypatch):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        await service.refresh(issued["refresh_token"])
        _disable_replay_grace_window(monkeypatch)

        with caplog.at_level("WARNING"):
            with pytest.raises(UnauthorizedError):
                await service.refresh(issued["refresh_token"])

        assert any(
            getattr(record, "event", None) == "refresh_token_reuse_detected" for record in caplog.records
        )

    async def test_logout_does_not_relabel_already_consumed_tokens(self, mock_db):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        owner_id = issued["user"]["id"]
        rotated = await service.refresh(issued["refresh_token"])

        await service.logout(owner_id)

        consumed_doc = await mock_db["userRefreshTokens"].find_one({"token_id": _stored_token_id(issued["refresh_token"])})
        assert consumed_doc["revoked_reason"] == "consumed"

        active_doc = await mock_db["userRefreshTokens"].find_one({"token_id": _stored_token_id(rotated["refresh_token"])})
        assert active_doc["revoked"] is True
        assert active_doc["revoked_reason"] == "logout"

    async def test_logout_by_refresh_token_revokes_session_without_owner_id(self, mock_db):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )

        await service.logout_by_refresh_token(issued["refresh_token"])

        doc = await mock_db["userRefreshTokens"].find_one({"token_id": _stored_token_id(issued["refresh_token"])})
        assert doc["revoked"] is True

        with pytest.raises(UnauthorizedError):
            await service.refresh(issued["refresh_token"])

    async def test_logout_by_refresh_token_revokes_other_family_tokens(self, mock_db, caplog):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        rotated = await service.refresh(issued["refresh_token"])

        await service.logout_by_refresh_token(rotated["refresh_token"])

        active_doc = await mock_db["userRefreshTokens"].find_one({"token_id": _stored_token_id(rotated["refresh_token"])})
        assert active_doc["revoked"] is True
        assert active_doc["revoked_reason"] == "logout"

        with caplog.at_level("WARNING"):
            with pytest.raises(UnauthorizedError):
                await service.refresh(rotated["refresh_token"])

        assert not any(
            getattr(record, "event", None) == "refresh_token_reuse_detected" for record in caplog.records
        )

    async def test_logout_by_refresh_token_with_expired_token_is_a_noop(self, mock_db, caplog):
        await _seed_tenant(mock_db)
        service = AuthService(mock_db)
        issued = await service.login_unified(
            identifier="tenant@example.com", password="correct-horse", is_email=True
        )
        await mock_db["userRefreshTokens"].update_one(
            {"token_id": _stored_token_id(issued["refresh_token"])},
            {"$set": {"expires_at": datetime.now(tz=UTC) - timedelta(days=1)}},
        )

        with caplog.at_level("WARNING"):
            await service.logout_by_refresh_token(issued["refresh_token"])

        assert not any(
            getattr(record, "event", None) == "refresh_token_reuse_detected" for record in caplog.records
        )

    async def test_logout_by_refresh_token_with_unknown_token_is_a_noop(self, mock_db):
        service = AuthService(mock_db)

        await service.logout_by_refresh_token("not-a-real-refresh-token")

        assert await mock_db["userRefreshTokens"].count_documents({}) == 0


class TestRefreshRebuildsAuthorizationClaims:
    async def test_refresh_uses_current_role_tenant_and_school_not_stale_token_claims(self, mock_db):
        settings = Settings(secret_key="test-secret-key-for-tests-32chars!!")
        user_repo = UserRepository(mock_db)
        user = await user_repo.create(
            UserCreate(
                role=UserRole.SCHOOL_ADMIN,
                name="School Admin One",
                email="admin@example.com",
                hashed_password=hash_password("correct-horse"),
                tenant_id="tenant-old",
                school_id="school-old",
            )
        )
        service = AuthService(mock_db)

        issued = await service.login_unified(
            identifier="admin@example.com", password="correct-horse", is_email=True
        )
        original_payload = _decode_access_token(issued["access_token"], settings)
        assert original_payload["role"] == "school_admin"
        assert original_payload["tenant_id"] == "tenant-old"
        assert original_payload["school_id"] == "school-old"

        await user_repo.update(
            user.id,
            {"role": UserRole.TENANT, "tenant_id": "tenant-new", "school_id": "school-new"},
        )

        rotated = await service.refresh(issued["refresh_token"])
        rotated_payload = _decode_access_token(rotated["access_token"], settings)

        assert rotated_payload["role"] == "tenant"
        assert rotated_payload["tenant_id"] == "tenant-new"
        assert rotated_payload["school_id"] == "school-new"

        twice_rotated = await service.refresh(rotated["refresh_token"])
        twice_rotated_payload = _decode_access_token(twice_rotated["access_token"], settings)

        assert twice_rotated_payload["role"] == "tenant"
        assert twice_rotated_payload["tenant_id"] == "tenant-new"
        assert twice_rotated_payload["school_id"] == "school-new"
