"""Unit tests for the Content Aggregator partner auth flow (#458).

Uses mongomock-motor for repository tests — no real MongoDB required.
"""
from __future__ import annotations

import ast
from datetime import UTC, datetime
from pathlib import Path

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.platform.auth.hashing import hash_password
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.services.content_aggregator.auth import ContentAggregatorAuth

PACKAGE_ROOT = Path(__file__).resolve().parents[2] / "app"


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
    tenant_id: str = "tenant-a",
    allowed_scopes: list[str] | None = None,
    status: str = "active",
) -> None:
    await mock_db["integrationClients"].insert_one(
        {
            "client_id": client_id,
            "client_secret_hash": hash_password(secret),
            "tenant_id": tenant_id,
            "allowed_scopes": allowed_scopes if allowed_scopes is not None else ["content:read"],
            "status": status,
            "created_at": datetime.now(tz=UTC),
        }
    )


# ---------------------------------------------------------------------------
# issue_token — happy path
# ---------------------------------------------------------------------------


class TestIssueTokenSuccess:
    async def test_valid_credentials_return_full_token_envelope(self, mock_db, auth):
        await _seed_client(mock_db)

        result = await auth.issue_token("partner-1", "super-secret")

        assert set(result.keys()) == {"access_token", "refresh_token", "expires_in", "token_type"}
        assert result["token_type"] == "Bearer"
        assert isinstance(result["expires_in"], int) and result["expires_in"] > 0
        assert result["access_token"]
        assert result["refresh_token"]

    async def test_refresh_token_persisted(self, mock_db, auth):
        await _seed_client(mock_db)

        result = await auth.issue_token("partner-1", "super-secret")

        stored = await mock_db["integrationTokens"].find_one({"token_id": result["refresh_token"]})
        assert stored is not None
        assert stored["client_id"] == "partner-1"
        assert stored["type"] == "refresh"
        assert stored["revoked"] is False

    async def test_access_token_verifiable(self, mock_db, auth):
        await _seed_client(mock_db, tenant_id="tenant-a", allowed_scopes=["content:read"])

        result = await auth.issue_token("partner-1", "super-secret")
        payload = await auth.verify_token(result["access_token"])

        assert payload["client_id"] == "partner-1"
        assert payload["tenant_id"] == "tenant-a"
        assert payload["scopes"] == ["content:read"]


# ---------------------------------------------------------------------------
# issue_token — failure paths
# ---------------------------------------------------------------------------


class TestIssueTokenFailures:
    async def test_unknown_client_id_returns_401_no_enumeration(self, auth):
        with pytest.raises(UnauthorizedError) as exc_info:
            await auth.issue_token("does-not-exist", "whatever")
        assert exc_info.value.status_code == 401

    async def test_wrong_secret_returns_401(self, mock_db, auth):
        await _seed_client(mock_db, secret="correct-secret")

        with pytest.raises(UnauthorizedError) as exc_info:
            await auth.issue_token("partner-1", "wrong-secret")
        assert exc_info.value.status_code == 401

    async def test_unknown_and_wrong_secret_raise_identical_error_shape(self, mock_db, auth):
        """No user enumeration: both failure modes must be indistinguishable."""
        await _seed_client(mock_db, secret="correct-secret")

        with pytest.raises(UnauthorizedError) as unknown_exc:
            await auth.issue_token("does-not-exist", "whatever")
        with pytest.raises(UnauthorizedError) as wrong_secret_exc:
            await auth.issue_token("partner-1", "wrong-secret")

        assert unknown_exc.value.code == wrong_secret_exc.value.code
        assert unknown_exc.value.message == wrong_secret_exc.value.message
        assert unknown_exc.value.status_code == wrong_secret_exc.value.status_code

    async def test_disabled_client_returns_403_tenant_not_allowed(self, mock_db, auth):
        await _seed_client(mock_db, status="disabled")

        with pytest.raises(AppError) as exc_info:
            await auth.issue_token("partner-1", "super-secret")
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "TENANT_NOT_ALLOWED"

    async def test_tenant_mismatch_returns_403_tenant_not_allowed(self, mock_db, auth):
        await _seed_client(mock_db, tenant_id="tenant-a")

        with pytest.raises(AppError) as exc_info:
            await auth.issue_token("partner-1", "super-secret", tenant_id="tenant-b")
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "TENANT_NOT_ALLOWED"

    async def test_excess_scope_returns_403_scope_insufficient(self, mock_db, auth):
        await _seed_client(mock_db, allowed_scopes=["content:read"])

        with pytest.raises(AppError) as exc_info:
            await auth.issue_token("partner-1", "super-secret", scopes=["content:write"])
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "SCOPE_INSUFFICIENT"


# ---------------------------------------------------------------------------
# verify_token
# ---------------------------------------------------------------------------


class TestVerifyToken:
    async def test_garbage_token_raises_unauthorized(self, auth):
        with pytest.raises(UnauthorizedError):
            await auth.verify_token("not-a-real-token")


# ---------------------------------------------------------------------------
# Static checks required by #458's action items
# ---------------------------------------------------------------------------


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
    """Within the #458 feature surface, no file outside auth.py/_jwt.py may
    import the JWT library directly.

    Scoped to the content_aggregator package + its controller — NOT a
    repo-wide rule. app/controllers/webhook_controller.py already imports
    `jose` for unrelated pre-existing webhook signature verification; that's
    out of #458's scope and untouched here.
    """

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
    """Mirrors the existing Vonage secret-logging test pattern: grep source for
    obvious accidental logging of the raw client_secret / access token."""

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
