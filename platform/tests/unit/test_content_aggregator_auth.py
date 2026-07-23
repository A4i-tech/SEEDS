"""Unit tests for the Content Aggregator partner auth flow (#458 issue/verify,
#459 refresh/rotation/reuse-detection/revocation).

Uses mongomock-motor for repository tests — no real MongoDB required.
"""
from __future__ import annotations

import ast
import asyncio
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from mongomock_motor import AsyncMongoMockClient

from app.controllers import content_aggregator_auth_controller
from app.platform.auth.hashing import hash_password
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.platform.telemetry import configure_telemetry
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
# refresh_token — rotation / single-use / reuse detection / expiry (#459)
# ---------------------------------------------------------------------------


async def _seed_expired_refresh_token(
    mock_db,
    *,
    token_id: str,
    client_id: str = "partner-1",
    tenant_id: str = "tenant-a",
    scopes: list[str] | None = None,
    revoked: bool = False,
) -> None:
    await mock_db["integrationTokens"].insert_one(
        {
            "token_id": token_id,
            "client_id": client_id,
            "type": "refresh",
            "family_id": token_id,
            "tenant_id": tenant_id,
            "scopes": scopes if scopes is not None else ["content:read"],
            "expires_at": datetime.now(tz=UTC) - timedelta(days=1),
            "revoked": revoked,
            "created_at": datetime.now(tz=UTC) - timedelta(days=31),
        }
    )


class TestRefreshTokenSuccess:
    async def test_rotation_returns_new_pair_and_revokes_old(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret")
        old_refresh = issued["refresh_token"]

        result = await auth.refresh_token(old_refresh)

        assert set(result.keys()) == {"access_token", "refresh_token", "expires_in", "token_type"}
        assert result["refresh_token"] != old_refresh

        old_doc = await mock_db["integrationTokens"].find_one({"token_id": old_refresh})
        assert old_doc["revoked"] is True

        new_doc = await mock_db["integrationTokens"].find_one({"token_id": result["refresh_token"]})
        assert new_doc is not None
        assert new_doc["revoked"] is False
        assert new_doc["family_id"] == old_refresh

    async def test_rotated_access_token_carries_original_scopes_not_escalated(self, mock_db, auth):
        await _seed_client(mock_db, allowed_scopes=["content:read", "content:write"])
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        result = await auth.refresh_token(issued["refresh_token"])
        payload = await auth.verify_token(result["access_token"])

        assert payload["scopes"] == ["content:read"]

    async def test_old_refresh_token_unusable_after_rotation(self, mock_db, auth, settings):
        configure_telemetry(settings)
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret")
        old_refresh = issued["refresh_token"]

        await auth.refresh_token(old_refresh)

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(old_refresh)


class TestRefreshTokenReuseDetection:
    async def test_replaying_revoked_token_revokes_entire_family(self, mock_db, auth, settings):
        configure_telemetry(settings)
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret")
        root_refresh = issued["refresh_token"]
        rotated = await auth.refresh_token(root_refresh)

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(root_refresh)  # replay of already-revoked token

        # the still-fresh sibling token from the same family must now be dead too
        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(rotated["refresh_token"])

        docs = [doc async for doc in mock_db["integrationTokens"].find({"family_id": root_refresh})]
        assert len(docs) == 2
        assert all(doc["revoked"] is True for doc in docs)


class TestRefreshTokenConcurrency:
    async def test_concurrent_refresh_with_same_token_only_one_winner(
        self, mock_db, auth, settings
    ):
        """Two simultaneous refreshes of the same token must not both succeed.

        Exercises the atomic try_consume claim directly rather than relying
        on true OS-level thread interleaving (mongomock-motor runs on a
        single event loop, so asyncio.gather here only proves the repository
        method itself is race-safe — a second claim on an already-consumed
        token_id must return None).
        """
        configure_telemetry(settings)
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret")
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
        from app.repositories.integration_token_repository import IntegrationTokenRepository

        repo = IntegrationTokenRepository(mock_db)
        await repo.insert_refresh_token(
            token_id="race-token",
            client_id="partner-1",
            family_id="race-token",
            tenant_id="tenant-a",
            scopes=["content:read"],
            expires_at=datetime.now(tz=UTC) + timedelta(days=1),
            created_at=datetime.now(tz=UTC),
        )

        first = await repo.try_consume("race-token")
        second = await repo.try_consume("race-token")

        assert first is not None
        assert second is None


class TestRefreshTokenExpired:
    async def test_expired_token_raises_distinct_error_code(self, mock_db, auth):
        await _seed_client(mock_db)
        await _seed_expired_refresh_token(mock_db, token_id="expired-refresh-token")

        with pytest.raises(AppError) as exc_info:
            await auth.refresh_token("expired-refresh-token")
        assert exc_info.value.code == "REFRESH_TOKEN_EXPIRED"
        assert exc_info.value.status_code == 401


class TestRefreshTokenUnknownOrDisabledClient:
    async def test_unknown_token_raises_generic_unauthorized(self, auth):
        with pytest.raises(UnauthorizedError):
            await auth.refresh_token("does-not-exist")

    async def test_disabled_client_rejected_at_refresh(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret")

        await mock_db["integrationClients"].update_one(
            {"client_id": "partner-1"}, {"$set": {"status": "disabled"}}
        )

        with pytest.raises(AppError) as exc_info:
            await auth.refresh_token(issued["refresh_token"])
        assert exc_info.value.code == "TENANT_NOT_ALLOWED"
        assert exc_info.value.status_code == 403


# ---------------------------------------------------------------------------
# admin_revoke_client (#459) — function-level only, no HTTP route
# ---------------------------------------------------------------------------


class TestAdminRevokeClient:
    async def test_revokes_every_token_across_all_families(self, mock_db, auth, settings):
        configure_telemetry(settings)
        await _seed_client(mock_db)
        first = await auth.issue_token("partner-1", "super-secret")
        second_pair = await auth.refresh_token(first["refresh_token"])  # second family member

        await auth.admin_revoke_client("partner-1")

        docs = [doc async for doc in mock_db["integrationTokens"].find({"client_id": "partner-1"})]
        assert len(docs) == 2
        assert all(doc["revoked"] is True for doc in docs)

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(second_pair["refresh_token"])

    def test_not_exposed_as_http_route(self):
        """#459 explicitly withholds a new admin HTTP route pending team sign-off."""
        paths = {route.path for route in content_aggregator_auth_controller.router.routes}
        assert not any("revoke" in path for path in paths)


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
