from __future__ import annotations

import ast
import asyncio
import hashlib
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.models.requests.content_aggregator_requests import ContentAggregatorTokenRequest
from app.platform.auth.hashing import hash_password
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.platform.telemetry import configure_telemetry
from app.services.content_aggregator.auth import ContentAggregatorAuth
from tests.support.mongomock_async import AsyncMongoMockClient

PACKAGE_ROOT = Path(__file__).resolve().parents[2] / "app"


def _stored_token_id(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def mock_db():
    client = AsyncMongoMockClient()
    return client["test_seeds"]


@pytest.fixture
def settings() -> Settings:
    return Settings(secret_key="test-secret-key-for-tests-32chars!!")


@pytest.fixture
def auth(mock_db, settings) -> ContentAggregatorAuth:
    return ContentAggregatorAuth(mock_db, settings)


async def _seed_client(
    mock_db,
    *,
    client_id: str = "partner-1",
    secret: str = "super-secret",
    name: str = "Partner One",
    tenant_ids: list[str] | None = None,
    allowed_scopes: list[str] | None = None,
    status: str = "active",
) -> None:
    await mock_db["integrationClients"].insert_one(
        {
            "client_id": client_id,
            "client_secret_hash": hash_password(secret),
            "name": name,
            "tenant_ids": tenant_ids if tenant_ids is not None else ["tenant-a"],
            "allowed_scopes": allowed_scopes if allowed_scopes is not None else ["content:read"],
            "status": status,
            "created_at": datetime.now(tz=UTC),
        }
    )


class TestIssueTokenSuccess:
    async def test_valid_credentials_return_full_token_envelope(self, mock_db, auth):
        await _seed_client(mock_db)

        result = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        assert set(result.keys()) == {"access_token", "refresh_token", "expires_in", "token_type", "scope"}
        assert result["token_type"] == "Bearer"
        assert result["scope"] == "content:read"
        assert isinstance(result["expires_in"], int) and result["expires_in"] > 0
        assert result["access_token"]
        assert result["refresh_token"]

    async def test_refresh_token_persisted(self, mock_db, auth):
        await _seed_client(mock_db)

        result = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        stored = await mock_db["integrationTokens"].find_one(
            {"token_id": _stored_token_id(result["refresh_token"])}
        )
        raw_stored = await mock_db["integrationTokens"].find_one(
            {"token_id": result["refresh_token"]}
        )
        assert stored is not None
        assert stored["token_id"] != result["refresh_token"]
        assert raw_stored is None
        assert stored["client_id"] == "partner-1"
        assert stored["type"] == "refresh"
        assert stored["revoked"] is False

    async def test_access_token_verifiable(self, mock_db, auth):
        await _seed_client(mock_db, tenant_ids=["tenant-a"], allowed_scopes=["content:read"])

        result = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        payload = await auth.verify_token(result["access_token"])

        assert payload["sub"] == "partner-1"
        assert payload["client_name"] == "Partner One"
        assert payload["tenant_ids"] == ["tenant-a"]
        assert payload["scope"] == "content:read"

    async def test_multi_tenant_client_receives_all_tenant_ids_by_default(self, mock_db, auth):
        await _seed_client(mock_db, tenant_ids=["tenant-a", "tenant-b"])

        result = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        payload = await auth.verify_token(result["access_token"])

        assert payload["tenant_ids"] == ["tenant-a", "tenant-b"]


class TestIssueTokenFailures:
    async def test_unknown_client_id_returns_401_no_enumeration(self, auth):
        with pytest.raises(UnauthorizedError) as exc_info:
            await auth.issue_token("does-not-exist", "whatever", scopes=["content:read"])
        assert exc_info.value.status_code == 401

    async def test_wrong_secret_returns_401(self, mock_db, auth):
        await _seed_client(mock_db, secret="correct-secret")

        with pytest.raises(UnauthorizedError) as exc_info:
            await auth.issue_token("partner-1", "wrong-secret", scopes=["content:read"])
        assert exc_info.value.status_code == 401

    async def test_unknown_and_wrong_secret_raise_identical_error_shape(self, mock_db, auth):
        await _seed_client(mock_db, secret="correct-secret")

        with pytest.raises(UnauthorizedError) as unknown_exc:
            await auth.issue_token("does-not-exist", "whatever", scopes=["content:read"])
        with pytest.raises(UnauthorizedError) as wrong_secret_exc:
            await auth.issue_token("partner-1", "wrong-secret", scopes=["content:read"])

        assert unknown_exc.value.code == wrong_secret_exc.value.code
        assert unknown_exc.value.message == wrong_secret_exc.value.message
        assert unknown_exc.value.status_code == wrong_secret_exc.value.status_code

    async def test_disabled_client_returns_403_tenant_not_allowed(self, mock_db, auth):
        await _seed_client(mock_db, status="disabled")

        with pytest.raises(AppError) as exc_info:
            await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "TENANT_NOT_ALLOWED"

    async def test_excess_scope_returns_403_scope_insufficient(self, mock_db, auth):
        await _seed_client(mock_db, allowed_scopes=["content:read"])

        with pytest.raises(AppError) as exc_info:
            await auth.issue_token("partner-1", "super-secret", scopes=["content:write"])
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "SCOPE_INSUFFICIENT"

    async def test_empty_allowed_scopes_rejected(self, mock_db, auth):
        """A client with no allowed_scopes must not receive a zero-scope token."""
        await _seed_client(mock_db, allowed_scopes=[])

        with pytest.raises(AppError) as exc_info:
            await auth.issue_token("partner-1", "super-secret", scopes=[])
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "SCOPE_INSUFFICIENT"


# ---------------------------------------------------------------------------
# Request model validation
# ---------------------------------------------------------------------------


class TestRequestValidation:
    def test_empty_client_id_rejected(self):
        with pytest.raises(ValidationError):
            ContentAggregatorTokenRequest(client_id="", client_secret="x")

    def test_empty_client_secret_rejected(self):
        with pytest.raises(ValidationError):
            ContentAggregatorTokenRequest(client_id="x", client_secret="")


class TestVerifyToken:
    async def test_garbage_token_raises_unauthorized(self, auth):
        with pytest.raises(UnauthorizedError):
            await auth.verify_token("not-a-real-token")


async def _seed_expired_refresh_token(
    mock_db,
    *,
    token_id: str,
    client_id: str = "partner-1",
    tenant_ids: list[str] | None = None,
    scope: str = "content:read",
    revoked: bool = False,
) -> None:
    await mock_db["integrationTokens"].insert_one(
        {
            "token_id": _stored_token_id(token_id),
            "client_id": client_id,
            "type": "refresh",
            "tenant_ids": tenant_ids if tenant_ids is not None else ["tenant-a"],
            "scope": scope,
            "expires_at": datetime.now(tz=UTC) - timedelta(days=1),
            "revoked": revoked,
            "created_at": datetime.now(tz=UTC) - timedelta(days=31),
        }
    )


class TestRefreshTokenSuccess:
    async def test_rotation_returns_new_pair_and_revokes_old(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        old_refresh = issued["refresh_token"]

        result = await auth.refresh_token(old_refresh)

        assert set(result.keys()) == {"access_token", "refresh_token", "expires_in", "token_type", "scope"}
        assert result["refresh_token"] != old_refresh

        old_doc = await mock_db["integrationTokens"].find_one(
            {"token_id": _stored_token_id(old_refresh)}
        )
        assert old_doc["revoked"] is True

        new_doc = await mock_db["integrationTokens"].find_one(
            {"token_id": _stored_token_id(result["refresh_token"])}
        )
        assert new_doc is not None
        assert new_doc["revoked"] is False

    async def test_rotated_access_token_carries_original_scopes_not_escalated(self, mock_db, auth):
        await _seed_client(mock_db, allowed_scopes=["content:read", "content:write"])
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        result = await auth.refresh_token(issued["refresh_token"])
        payload = await auth.verify_token(result["access_token"])

        assert payload["scope"] == "content:read"

    async def test_rotated_access_token_carries_original_tenant_ids(self, mock_db, auth):
        await _seed_client(mock_db, tenant_ids=["tenant-a", "tenant-b"])
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        result = await auth.refresh_token(issued["refresh_token"])
        payload = await auth.verify_token(result["access_token"])

        assert payload["tenant_ids"] == ["tenant-a", "tenant-b"]

    async def test_old_refresh_token_unusable_after_rotation(self, mock_db, auth, settings):
        configure_telemetry(settings)
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        old_refresh = issued["refresh_token"]

        await auth.refresh_token(old_refresh)

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(old_refresh)


class TestRefreshTokenReuseDetection:
    async def test_replaying_revoked_token_revokes_all_tokens_for_client(self, mock_db, auth, settings):
        configure_telemetry(settings)
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        root_refresh = issued["refresh_token"]
        rotated = await auth.refresh_token(root_refresh)

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(root_refresh)  # replay of already-revoked token

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(rotated["refresh_token"])

        docs = [doc async for doc in mock_db["integrationTokens"].find({"client_id": "partner-1"})]
        assert len(docs) == 2
        assert all(doc["revoked"] is True for doc in docs)

    async def test_replay_revokes_other_families_for_same_client(self, mock_db, auth, settings):
        configure_telemetry(settings)
        await _seed_client(mock_db)
        family_a = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        family_b = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        await auth.refresh_token(family_a["refresh_token"])

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(family_a["refresh_token"])  # replay of already-revoked token

        other_family_doc = await mock_db["integrationTokens"].find_one(
            {"token_id": _stored_token_id(family_b["refresh_token"])}
        )
        assert other_family_doc["revoked"] is True


class TestRefreshTokenConcurrency:
    async def test_concurrent_refresh_with_same_token_only_one_winner(
        self, mock_db, auth, settings
    ):
        configure_telemetry(settings)
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        root_refresh = issued["refresh_token"]

        results = await asyncio.gather(
            auth.refresh_token(root_refresh),
            auth.refresh_token(root_refresh),
            return_exceptions=True,
        )

        successes = [r for r in results if not isinstance(r, BaseException)]
        failures = [r for r in results if isinstance(r, BaseException)]
        assert len(successes) == 1
        assert len(failures) == 1
        assert isinstance(failures[0], UnauthorizedError)

    async def test_repository_level_double_consume_is_race_safe(self, mock_db):
        from app.platform.auth.refresh_tokens import RefreshTokenReusedError
        from app.repositories.integration_token_repository import (
            IntegrationTokenRepository,
            NewRefreshToken,
        )

        repo = IntegrationTokenRepository(mock_db)
        await repo.insert_refresh_token(
            NewRefreshToken(
                token_id="race-token",
                client_id="partner-1",
                tenant_ids=["tenant-a"],
                scope="content:read",
                expires_at=datetime.now(tz=UTC) + timedelta(days=1),
                created_at=datetime.now(tz=UTC),
            )
        )

        first = await repo.try_consume("race-token")
        assert first is not None

        with pytest.raises(RefreshTokenReusedError):
            await repo.try_consume("race-token")


class TestRefreshTokenExpired:
    async def test_expired_token_raises_distinct_error_code(self, mock_db, auth):
        await _seed_client(mock_db)
        await _seed_expired_refresh_token(mock_db, token_id="expired-refresh-token")

        with pytest.raises(AppError) as exc_info:
            await auth.refresh_token("expired-refresh-token")
        assert exc_info.value.code == "REFRESH_TOKEN_EXPIRED"
        assert exc_info.value.status_code == 401

    async def test_expired_unconsumed_token_does_not_trigger_mass_revocation(self, mock_db, auth):
        await _seed_client(mock_db)
        await _seed_expired_refresh_token(mock_db, token_id="expired-refresh-token")
        sibling = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        with pytest.raises(AppError):
            await auth.refresh_token("expired-refresh-token")

        expired_doc = await mock_db["integrationTokens"].find_one(
            {"token_id": _stored_token_id("expired-refresh-token")}
        )
        assert expired_doc["revoked"] is False

        sibling_doc = await mock_db["integrationTokens"].find_one(
            {"token_id": _stored_token_id(sibling["refresh_token"])}
        )
        assert sibling_doc["revoked"] is False


class TestRefreshTokenUnknownOrDisabledClient:
    async def test_unknown_token_raises_generic_unauthorized(self, auth):
        with pytest.raises(UnauthorizedError):
            await auth.refresh_token("does-not-exist")

    async def test_disabled_client_rejected_at_refresh(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        await mock_db["integrationClients"].update_one(
            {"client_id": "partner-1"}, {"$set": {"status": "disabled"}}
        )

        with pytest.raises(AppError) as exc_info:
            await auth.refresh_token(issued["refresh_token"])
        assert exc_info.value.code == "TENANT_NOT_ALLOWED"
        assert exc_info.value.status_code == 403


def _iter_py_files(root: Path):
    for path in root.rglob("*.py"):
        if "__pycache__" in path.parts:
            continue
        yield path


def _imported_module_names(tree: ast.Module) -> set[str]:
    names: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            names.update(alias.name.split(".")[0] for alias in node.names)
        elif isinstance(node, ast.ImportFrom) and node.module:
            names.add(node.module.split(".")[0])
    return names


class TestJwtImportConfinement:
    FEATURE_FILES = [
        PACKAGE_ROOT / "controllers" / "content_aggregator_auth_controller.py",
        *(_iter_py_files(PACKAGE_ROOT / "services" / "content_aggregator")),
    ]
    ALLOWED_FILES = {"_jwt.py"}

    def test_jose_only_imported_from_jwt_helper(self):
        offenders = []
        for path in self.FEATURE_FILES:
            if path.name in self.ALLOWED_FILES:
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"))
            if "jose" in _imported_module_names(tree):
                offenders.append(str(path))
        assert offenders == [], f"'jose' imported outside _jwt.py: {offenders}"


class TestNoSecretLogging:
    def test_auth_module_never_logs_secret_or_token_variables(self):
        source = (PACKAGE_ROOT / "services" / "content_aggregator" / "auth.py").read_text(
            encoding="utf-8"
        )
        forbidden_patterns = ["client_secret)", "access_token)", "refresh_token)"]
        for line in source.splitlines():
            if "logger." not in line:
                continue
            for pattern in forbidden_patterns:
                assert pattern not in line, f"possible secret logging: {line!r}"
