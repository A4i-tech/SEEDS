"""
Unit tests for telemetry and JWT auth core.
"""

from __future__ import annotations

import os
from datetime import UTC, datetime, timedelta

import pytest

# ---------------------------------------------------------------------------
# Force settings to use safe defaults (no real DB / no real keys needed)
# ---------------------------------------------------------------------------
os.environ.setdefault("SECRET_KEY", "test-secret-key-for-unit-tests-only")
os.environ.setdefault("AUTH_TYPE", "jwt")
os.environ.setdefault("JWT_EXPIRES_IN", "1d")
os.environ.setdefault("PASSWORD_SALT_ROUNDS", "4")  # Fast for tests


# ===========================================================================
# Telemetry tests
# ===========================================================================


class TestTelemetryNoop:
    def test_telemetry_noop_without_connection_string(self) -> None:
        """configure_telemetry with no connection string must not raise."""
        # Reset module state so each test is isolated
        import app.platform.telemetry as tel_mod

        tel_mod._telemetry_configured = False
        tel_mod._metrics = {}

        from app.platform.settings import Settings

        settings = Settings(applicationinsights_connection_string="")
        # Should complete without error
        from app.platform.telemetry import configure_telemetry

        configure_telemetry(settings)
        # After call: configured flag is True, no-op instruments registered
        assert tel_mod._telemetry_configured is True

    def test_telemetry_metrics_noop(self) -> None:
        """get_counter returns an instrument that accepts add() without error."""
        import app.platform.telemetry as tel_mod

        tel_mod._telemetry_configured = False
        tel_mod._metrics = {}

        from app.platform.settings import Settings

        settings = Settings(applicationinsights_connection_string="")
        from app.platform.telemetry import configure_telemetry, get_counter

        configure_telemetry(settings)

        counter = get_counter("auth.failures")
        # Must not raise
        counter.add(1, {"reason": "test"})

    def test_histogram_noop(self) -> None:
        """get_histogram returns an instrument that accepts record() without error."""
        import app.platform.telemetry as tel_mod

        tel_mod._telemetry_configured = False
        tel_mod._metrics = {}

        from app.platform.settings import Settings

        settings = Settings(applicationinsights_connection_string="")
        from app.platform.telemetry import configure_telemetry, get_histogram

        configure_telemetry(settings)

        hist = get_histogram("http.request.duration_ms")
        hist.record(42.5)

    def test_updown_counter_noop(self) -> None:
        """get_updown_counter returns an instrument that accepts add() without error."""
        import app.platform.telemetry as tel_mod

        tel_mod._telemetry_configured = False
        tel_mod._metrics = {}

        from app.platform.settings import Settings

        settings = Settings(applicationinsights_connection_string="")
        from app.platform.telemetry import configure_telemetry, get_updown_counter

        configure_telemetry(settings)

        udc = get_updown_counter("conferences.active")
        udc.add(1)
        udc.add(-1)

    def test_idempotent(self) -> None:
        """configure_telemetry called twice must not raise."""
        import app.platform.telemetry as tel_mod

        tel_mod._telemetry_configured = False
        tel_mod._metrics = {}

        from app.platform.settings import Settings

        settings = Settings(applicationinsights_connection_string="")
        from app.platform.telemetry import configure_telemetry

        configure_telemetry(settings)
        configure_telemetry(settings)  # second call — no-op


# ===========================================================================
# Password hashing tests
# ===========================================================================


class TestPasswordHashing:
    def test_hash_and_verify_password(self) -> None:
        """hash_password produces a hash; verify_password confirms correct plaintext."""
        from app.platform.auth.hashing import hash_password, verify_password

        plain = "secret"
        hashed = hash_password(plain)

        assert hashed != plain
        assert verify_password(plain, hashed) is True

    def test_wrong_password_fails_verification(self) -> None:
        """verify_password returns False for incorrect plaintext."""
        from app.platform.auth.hashing import hash_password, verify_password

        hashed = hash_password("secret")
        assert verify_password("wrong", hashed) is False

    def test_different_hashes_for_same_password(self) -> None:
        """bcrypt generates distinct hashes for the same password (salted)."""
        from app.platform.auth.hashing import hash_password

        h1 = hash_password("same")
        h2 = hash_password("same")
        assert h1 != h2


# ===========================================================================
# JWT tests
# ===========================================================================


class TestJWT:
    def test_create_and_verify_token(self) -> None:
        """create_access_token produces a token; verify_token returns correct claims."""
        from app.platform.auth.jwt import create_access_token, verify_token

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
        from app.platform.auth.jwt import create_access_token, verify_token
        from app.platform.error_handling import UnauthorizedError

        token = create_access_token(
            {"sub": "user-123", "role": "teacher"},
            expires_delta=timedelta(seconds=-1),
        )

        with pytest.raises(UnauthorizedError, match="expired"):
            verify_token(token)

    def test_wrong_issuer_raises_unauthorized(self) -> None:
        """A token signed with a different issuer raises UnauthorizedError."""
        from jose import jwt as jose_jwt

        from app.platform.error_handling import UnauthorizedError
        from app.platform.settings import get_settings

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

        from app.platform.auth.jwt import verify_token

        with pytest.raises(UnauthorizedError):
            verify_token(bad_token)

    def test_invalid_signature_raises_unauthorized(self) -> None:
        """A token signed with a different key raises UnauthorizedError."""
        from jose import jwt as jose_jwt

        from app.platform.error_handling import UnauthorizedError

        now = datetime.now(tz=UTC)
        payload = {
            "sub": "user-123",
            "role": "teacher",
            "iss": "platform",
            "iat": now,
            "exp": now + timedelta(hours=1),
        }
        bad_token = jose_jwt.encode(payload, "wrong-key", algorithm="HS256")

        from app.platform.auth.jwt import verify_token

        with pytest.raises(UnauthorizedError):
            verify_token(bad_token)

    def test_parse_expires_delta_formats(self) -> None:
        """_parse_expires_delta handles d/h/s/plain integer formats."""
        from app.platform.auth.jwt import _parse_expires_delta

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
        from app.platform.auth.dependencies import require_teacher

        user = {"sub": "u1", "role": "teacher"}
        result = await require_teacher(user=user)
        assert result == user

    @pytest.mark.asyncio
    async def test_require_teacher_blocks_tenant(self) -> None:
        """require_teacher raises ForbiddenError when role == 'tenant'."""
        from app.platform.auth.dependencies import require_teacher
        from app.platform.error_handling import ForbiddenError

        user = {"sub": "u1", "role": "tenant"}
        with pytest.raises(ForbiddenError):
            await require_teacher(user=user)

    @pytest.mark.asyncio
    async def test_require_tenant_passes(self) -> None:
        """require_tenant returns the user dict when role == 'tenant'."""
        from app.platform.auth.dependencies import require_tenant

        user = {"sub": "u1", "role": "tenant"}
        result = await require_tenant(user=user)
        assert result == user

    @pytest.mark.asyncio
    async def test_require_tenant_blocks_teacher(self) -> None:
        """require_tenant raises ForbiddenError when role == 'teacher'."""
        from app.platform.auth.dependencies import require_tenant
        from app.platform.error_handling import ForbiddenError

        user = {"sub": "u1", "role": "teacher"}
        with pytest.raises(ForbiddenError):
            await require_tenant(user=user)
