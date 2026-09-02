"""
Unit tests for telemetry and JWT auth core.
"""

from __future__ import annotations

import logging
import os
from datetime import UTC, datetime, timedelta

import pytest
from jose import jwt as jose_jwt
from opentelemetry._logs import get_logger_provider
from opentelemetry.sdk._logs import LoggerProvider as SDKLoggerProvider

import app.platform.telemetry as tel_mod
from app.platform.auth.dependencies import (
    require_admin,
    require_admin_or_reviewer,
    require_teacher,
    require_tenant,
)
from app.platform.auth.hashing import hash_password, verify_password
from app.platform.auth.jwt import (
    _parse_expires_delta,
    create_access_token,
    verify_token,
)
from app.platform.error_handling import ForbiddenError, UnauthorizedError
from app.platform.logging import AppInsightsEventHandler
from app.platform.settings import Settings, get_settings
from app.platform.telemetry import configure_telemetry, get_counter

# ---------------------------------------------------------------------------
# Force settings to use safe defaults (no real DB / no real keys needed)
# ---------------------------------------------------------------------------
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only")
os.environ.setdefault("AUTH_TYPE", "jwt")
os.environ.setdefault("JWT_EXPIRES_IN", "1d")
os.environ.setdefault("PASSWORD_SALT_ROUNDS", "4")  # Fast for tests

_FAKE_CONNECTION_STRING = (
    "InstrumentationKey=00000000-0000-0000-0000-000000000000;"
    "IngestionEndpoint=https://fake.example.com/"
)


# ===========================================================================
# Telemetry tests
# ===========================================================================


class TestTelemetry:
    def test_disabled_without_connection_string(self) -> None:
        """configure_telemetry with no connection string must not raise, counters stay no-op."""
        tel_mod._telemetry_configured = False
        tel_mod._metrics = {}

        settings = Settings(applicationinsights_connection_string="")
        configure_telemetry(settings)

        assert tel_mod._telemetry_configured is True
        get_counter("auth.failures").add(1, {"reason": "test"})  # must not raise

    def test_configures_real_metrics_with_connection_string(self) -> None:
        """configure_telemetry with a connection string registers real counters."""
        tel_mod._telemetry_configured = False
        tel_mod._metrics = {}

        settings = Settings(applicationinsights_connection_string=_FAKE_CONNECTION_STRING)
        configure_telemetry(settings)

        assert tel_mod._telemetry_configured is True
        counter = get_counter("auth.failures")
        counter.add(1, {"reason": "test"})  # must not raise

    def test_app_insights_event_handler_attached_to_app_logger(self) -> None:
        """configure_telemetry must attach AppInsightsEventHandler to the "app" logger, not root."""
        tel_mod._telemetry_configured = False
        tel_mod._metrics = {}
        logging.getLogger().handlers.clear()
        logging.getLogger("app").handlers.clear()

        settings = Settings(applicationinsights_connection_string=_FAKE_CONNECTION_STRING)
        configure_telemetry(settings)

        assert any(
            isinstance(h, AppInsightsEventHandler) for h in logging.getLogger("app").handlers
        )
        assert not any(
            isinstance(h, AppInsightsEventHandler) for h in logging.getLogger().handlers
        )

    def test_real_logger_provider_registered(self) -> None:
        """configure_telemetry must leave a real (non-proxy) LoggerProvider registered."""
        tel_mod._telemetry_configured = False
        tel_mod._metrics = {}

        settings = Settings(applicationinsights_connection_string=_FAKE_CONNECTION_STRING)
        configure_telemetry(settings)

        assert isinstance(get_logger_provider(), SDKLoggerProvider)

    def test_idempotent(self) -> None:
        """configure_telemetry called twice must not raise or double-configure."""
        tel_mod._telemetry_configured = False
        tel_mod._metrics = {}

        settings = Settings(applicationinsights_connection_string=_FAKE_CONNECTION_STRING)
        configure_telemetry(settings)
        configure_telemetry(settings)  # second call — no-op


# ===========================================================================
# Password hashing tests
# ===========================================================================


class TestPasswordHashing:
    def test_hash_and_verify_password(self) -> None:
        """hash_password produces a hash; verify_password confirms correct plaintext."""
        plain = "secret"
        hashed = hash_password(plain)

        assert hashed != plain
        assert verify_password(plain, hashed) is True

    def test_wrong_password_fails_verification(self) -> None:
        """verify_password returns False for incorrect plaintext."""
        hashed = hash_password("secret")
        assert verify_password("wrong", hashed) is False

    def test_different_hashes_for_same_password(self) -> None:
        """bcrypt generates distinct hashes for the same password (salted)."""
        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2


# ===========================================================================
# JWT tests
# ===========================================================================


class TestJWT:
    def test_create_and_verify_token(self) -> None:
        """create_access_token produces a token; verify_token returns correct claims."""
        token = create_access_token(
            {"sub": "user-123", "role": "teacher", "tenant_id": "tenant-abc"}
        )
        payload = verify_token(token)

        assert payload["sub"] == "user-123"
        assert payload["role"] == "teacher"
        assert payload["tenant_id"] == "tenant-abc"
        assert payload["iss"] == "platform"

    def test_expired_token_raises_unauthorized(self) -> None:
        """A token with exp in the past raises UnauthorizedError."""
        token = create_access_token(
            {"sub": "user-123", "role": "teacher"},
            expires_delta=timedelta(seconds=-1),
        )

        with pytest.raises(UnauthorizedError, match="expired"):
            verify_token(token)

    def test_wrong_issuer_raises_unauthorized(self) -> None:
        """A token signed with a different issuer raises UnauthorizedError."""
        settings = get_settings()
        now = datetime.now(tz=UTC)
        bad_payload = {
            "sub": "user-123",
            "role": "teacher",
            "iss": "other-system",
            "iat": now,
            "exp": now + timedelta(hours=1),
        }
        bad_token = jose_jwt.encode(
            bad_payload, settings.secret_key, algorithm="HS256"
        )

        with pytest.raises(UnauthorizedError):
            verify_token(bad_token)

    def test_invalid_signature_raises_unauthorized(self) -> None:
        """A token signed with a different key raises UnauthorizedError."""
        now = datetime.now(tz=UTC)
        payload = {
            "sub": "user-123",
            "role": "teacher",
            "iss": "platform",
            "iat": now,
            "exp": now + timedelta(hours=1),
        }
        bad_token = jose_jwt.encode(payload, "wrong-key", algorithm="HS256")

        with pytest.raises(UnauthorizedError):
            verify_token(bad_token)

    def test_parse_expires_delta_formats(self) -> None:
        """_parse_expires_delta handles d/h/s/plain integer formats."""
        assert _parse_expires_delta("7d") == timedelta(days=7)
        assert _parse_expires_delta("24h") == timedelta(hours=24)
        assert _parse_expires_delta("3600") == timedelta(seconds=3600)
        assert _parse_expires_delta("30m") == timedelta(minutes=30)


# ===========================================================================
# Dependencies tests
# ===========================================================================


class TestDependencies:
    @pytest.mark.asyncio
    async def test_require_teacher_passes(self) -> None:
        """require_teacher returns the user dict when role == 'teacher'."""
        user = {"sub": "u1", "role": "teacher"}
        result = await require_teacher(user=user)
        assert result == user

    @pytest.mark.asyncio
    async def test_require_teacher_blocks_tenant(self) -> None:
        """require_teacher raises ForbiddenError when role == 'tenant'."""
        user = {"sub": "u1", "role": "tenant"}
        with pytest.raises(ForbiddenError):
            await require_teacher(user=user)

    @pytest.mark.asyncio
    async def test_require_tenant_passes(self) -> None:
        """require_tenant returns the user dict when role == 'tenant'."""
        user = {"sub": "u1", "role": "tenant"}
        result = await require_tenant(user=user)
        assert result == user

    @pytest.mark.asyncio
    async def test_require_tenant_blocks_teacher(self) -> None:
        """require_tenant raises ForbiddenError when role == 'teacher'."""
        user = {"sub": "u1", "role": "teacher"}
        with pytest.raises(ForbiddenError):
            await require_tenant(user=user)

    @pytest.mark.asyncio
    async def test_require_admin_passes(self) -> None:
        user = {"sub": "u1", "role": "admin"}
        result = await require_admin(user=user)
        assert result == user

    @pytest.mark.asyncio
    async def test_require_admin_blocks_reviewer(self) -> None:
        user = {"sub": "u1", "role": "reviewer"}
        with pytest.raises(ForbiddenError):
            await require_admin(user=user)

    @pytest.mark.asyncio
    async def test_require_admin_or_reviewer_passes_admin(self) -> None:
        user = {"sub": "u1", "role": "admin"}
        result = await require_admin_or_reviewer(user=user)
        assert result == user

    @pytest.mark.asyncio
    async def test_require_admin_or_reviewer_passes_reviewer(self) -> None:
        user = {"sub": "u1", "role": "reviewer"}
        result = await require_admin_or_reviewer(user=user)
        assert result == user

    @pytest.mark.asyncio
    async def test_require_admin_or_reviewer_blocks_other_role(self) -> None:
        user = {"sub": "u1", "role": "teacher"}
        with pytest.raises(ForbiddenError):
            await require_admin_or_reviewer(user=user)

    @pytest.mark.asyncio
    async def test_require_admin_or_reviewer_dev_bypass_allows_tenant(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.platform.settings import get_settings

        monkeypatch.setenv("ENV", "development")
        get_settings.cache_clear()

        user = {"sub": "u1", "role": "tenant"}
        result = await require_admin_or_reviewer(user=user)
        assert result == user

    @pytest.mark.asyncio
    async def test_require_admin_dev_bypass_allows_tenant(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.platform.settings import get_settings

        monkeypatch.setenv("ENV", "development")
        get_settings.cache_clear()

        user = {"sub": "u1", "role": "tenant"}
        result = await require_admin(user=user)
        assert result == user

    @pytest.mark.asyncio
    async def test_require_admin_or_reviewer_blocks_tenant_in_production(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.platform.settings import get_settings

        monkeypatch.setenv("ENV", "production")
        get_settings.cache_clear()

        user = {"sub": "u1", "role": "tenant"}
        with pytest.raises(ForbiddenError):
            await require_admin_or_reviewer(user=user)

    @pytest.mark.asyncio
    async def test_require_admin_blocks_tenant_in_production(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.platform.settings import get_settings

        monkeypatch.setenv("ENV", "production")
        get_settings.cache_clear()

        user = {"sub": "u1", "role": "tenant"}
        with pytest.raises(ForbiddenError):
            await require_admin(user=user)
