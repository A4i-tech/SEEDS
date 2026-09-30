from __future__ import annotations

import ast
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from jose import jwt as jose_jwt
from pydantic import ValidationError

from app.models.requests.content_aggregator_requests import ContentAggregatorTokenRequest
from app.platform.auth.hashing import hash_password, hash_refresh_token
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.platform.telemetry import configure_telemetry
from app.services.content_aggregator.auth import ContentAggregatorAuth
from tests.support.mongomock_async import AsyncMongoMockClient

PACKAGE_ROOT = Path(__file__).resolve().parents[2] / "app"


@pytest.fixture(autouse=True)
def _telemetry():
    configure_telemetry(Settings(secret_key="test-secret-key-for-tests-32chars!!"))


def _decode_access_token(token: str, settings: Settings) -> dict:
    return jose_jwt.decode(
        token,
        settings.secret_key,
        algorithms=["HS256"],
        issuer="content-aggregator",
    )


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

    async def test_refresh_token_is_opaque_and_persisted_by_hash(self, mock_db, auth):
        await _seed_client(mock_db)

        result = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        with pytest.raises(Exception):  # noqa: B017, PT011 - opaque token, not a JWT
            jose_jwt.decode(
                result["refresh_token"],
                "anything",
                algorithms=["HS256"],
                options={"verify_signature": False},
            )

        token_id = hash_refresh_token(result["refresh_token"])
        stored = await mock_db["integrationTokens"].find_one({"token_id": token_id})
        assert stored is not None
        assert stored["client_id"] == "partner-1"
        assert stored["type"] == "refresh"
        assert stored["revoked"] is False

    async def test_raw_refresh_token_is_never_persisted(self, mock_db, auth):
        await _seed_client(mock_db)

        result = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        raw_match = await mock_db["integrationTokens"].find_one(
            {"token_id": result["refresh_token"]}
        )
        assert raw_match is None

    async def test_access_token_verifiable(self, mock_db, auth, settings):
        await _seed_client(mock_db, tenant_ids=["tenant-a"], allowed_scopes=["content:read"])

        result = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        payload = _decode_access_token(result["access_token"], settings)

        assert payload["sub"] == "partner-1"
        assert payload["client_name"] == "Partner One"
        assert payload["tenant_ids"] == ["tenant-a"]
        assert payload["scope"] == "content:read"

    async def test_multi_tenant_client_receives_all_tenant_ids_by_default(self, mock_db, auth, settings):
        await _seed_client(mock_db, tenant_ids=["tenant-a", "tenant-b"])

        result = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        payload = _decode_access_token(result["access_token"], settings)

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
        await _seed_client(mock_db, allowed_scopes=[])

        with pytest.raises(AppError) as exc_info:
            await auth.issue_token("partner-1", "super-secret", scopes=[])
        assert exc_info.value.status_code == 403
        assert exc_info.value.code == "SCOPE_INSUFFICIENT"


class TestRequestValidation:
    def test_empty_client_id_rejected(self):
        with pytest.raises(ValidationError):
            ContentAggregatorTokenRequest(client_id="", client_secret="x", scope="content:read")

    def test_empty_client_secret_rejected(self):
        with pytest.raises(ValidationError):
            ContentAggregatorTokenRequest(client_id="x", client_secret="", scope="content:read")


class TestRefreshTokenSuccess:
    async def test_refresh_does_not_require_client_id_or_client_secret(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        result = await auth.refresh_token(issued["refresh_token"])

        assert set(result.keys()) == {"access_token", "refresh_token", "expires_in", "token_type", "scope"}

    async def test_refresh_token_is_rotated(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        result = await auth.refresh_token(issued["refresh_token"])

        assert result["refresh_token"] != issued["refresh_token"]

    async def test_old_refresh_token_is_single_use(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        await auth.refresh_token(issued["refresh_token"])

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(issued["refresh_token"])

    async def test_replaying_consumed_refresh_token_revokes_all_client_tokens(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        rotated = await auth.refresh_token(issued["refresh_token"])

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(issued["refresh_token"])

        # The new refresh token issued by the legitimate rotation must also be
        # revoked once reuse of the old token is detected.
        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(rotated["refresh_token"])

    async def test_refresh_does_not_write_to_integration_token_replays(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        await auth.refresh_token(issued["refresh_token"])

        assert "integrationTokenReplays" not in await mock_db.list_collection_names()

    async def test_refreshed_access_token_carries_original_scopes_not_escalated(self, mock_db, auth, settings):
        await _seed_client(mock_db, allowed_scopes=["content:read", "content:write"])
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        result = await auth.refresh_token(issued["refresh_token"])
        payload = _decode_access_token(result["access_token"], settings)

        assert payload["scope"] == "content:read"

    async def test_refreshed_access_token_carries_original_tenant_ids(self, mock_db, auth, settings):
        await _seed_client(mock_db, tenant_ids=["tenant-a", "tenant-b"])
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        result = await auth.refresh_token(issued["refresh_token"])
        payload = _decode_access_token(result["access_token"], settings)

        assert payload["tenant_ids"] == ["tenant-a", "tenant-b"]


class TestRefreshTokenExpiredOrRevoked:
    async def test_expired_refresh_token_raises_distinct_error_code(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        token_id = hash_refresh_token(issued["refresh_token"])
        await mock_db["integrationTokens"].update_one(
            {"token_id": token_id},
            {"$set": {"expires_at": datetime.now(tz=UTC) - timedelta(days=1)}},
        )

        with pytest.raises(AppError) as exc_info:
            await auth.refresh_token(issued["refresh_token"])
        assert exc_info.value.code == "REFRESH_TOKEN_EXPIRED"
        assert exc_info.value.status_code == 401

    async def test_revoked_refresh_token_rejected(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        token_id = hash_refresh_token(issued["refresh_token"])
        await mock_db["integrationTokens"].update_one(
            {"token_id": token_id}, {"$set": {"revoked": True}}
        )

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(issued["refresh_token"])

    async def test_invalid_tampered_refresh_token_is_rejected(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])
        tampered = issued["refresh_token"][:-1] + (
            "A" if issued["refresh_token"][-1] != "A" else "B"
        )

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(tampered)


class TestRefreshTokenUnknownOrDisabledClient:
    async def test_unknown_refresh_token_raises_generic_unauthorized(self, auth):
        with pytest.raises(UnauthorizedError):
            await auth.refresh_token("not-a-real-token")

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

    async def test_deleted_client_rejected_at_refresh(self, mock_db, auth):
        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        await mock_db["integrationClients"].delete_one({"client_id": "partner-1"})

        with pytest.raises(UnauthorizedError):
            await auth.refresh_token(issued["refresh_token"])


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


class TestAggregatorTokenControllerResponse:
    async def test_issue_token_response_serializes_refresh_token(self, mock_db, auth):
        from fastapi import Response

        from app.controllers.content_aggregator_auth_controller import issue_token
        from app.models.requests.content_aggregator_requests import ContentAggregatorTokenRequest

        await _seed_client(mock_db)

        result = await issue_token(
            Response(),
            body=ContentAggregatorTokenRequest(
                client_id="partner-1", client_secret="super-secret", scope="content:read"
            ),
            auth=auth,
        )

        body = result.model_dump()
        assert body["refresh_token"]
        assert body["access_token"]

    async def test_refresh_token_response_serializes_refresh_token(self, mock_db, auth):
        from fastapi import Response

        from app.controllers.content_aggregator_auth_controller import refresh_token
        from app.models.requests.content_aggregator_requests import ContentAggregatorRefreshRequest

        await _seed_client(mock_db)
        issued = await auth.issue_token("partner-1", "super-secret", scopes=["content:read"])

        result = await refresh_token(
            Response(),
            body=ContentAggregatorRefreshRequest(refresh_token=issued["refresh_token"]),
            auth=auth,
        )

        body = result.model_dump()
        assert body["refresh_token"]
        assert body["refresh_token"] != issued["refresh_token"]
