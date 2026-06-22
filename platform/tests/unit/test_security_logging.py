"""
Unit tests for security middleware, error handling, and structured logging.

Uses httpx.AsyncClient with ASGI transport – no real DB or external services.
"""

from __future__ import annotations

import json
import logging
import re
from contextlib import asynccontextmanager
from io import StringIO
from typing import AsyncGenerator
from unittest.mock import MagicMock, patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from httpx import ASGITransport, AsyncClient


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_app(
    env: str = "development",
    cors_origins: str = "*",
    include_error_route: bool = False,
    include_unhandled_route: bool = False,
) -> FastAPI:
    """Build a minimal FastAPI app with all platform middleware wired."""
    from app.platform.settings import Settings

    mock_settings = Settings(
        env=env,
        cors_allowed_origins=cors_origins,
        mongo_db_connection_string="",
    )

    @asynccontextmanager
    async def _noop_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        app.state.consumer_tasks = []
        yield

    from app.platform.error_handling import AppError, register_error_handlers
    from app.platform.logging import RequestIdMiddleware
    from app.platform.security import setup_security

    _app = FastAPI(title="Test App", lifespan=_noop_lifespan)

    # Wire middleware + error handlers
    setup_security(_app, mock_settings)
    _app.add_middleware(RequestIdMiddleware)
    register_error_handlers(_app)

    @_app.get("/ping")
    async def ping():
        return {"pong": True}

    if include_error_route:
        @_app.get("/raise-app-error")
        async def raise_app_error():
            raise AppError("TEST_CODE", "test message", 400)

    if include_unhandled_route:
        @_app.get("/raise-unhandled")
        async def raise_unhandled():
            raise RuntimeError("boom")  # noqa: EM101

    _app.state.mock_settings = mock_settings
    return _app


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_security_headers_present() -> None:
    """Every response must include all required security headers."""
    app = _make_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ping")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert response.headers["x-xss-protection"] == "1; mode=block"
    assert response.headers["referrer-policy"] == "strict-origin-when-cross-origin"
    assert "permissions-policy" in response.headers
    # HSTS must NOT appear in development
    assert "strict-transport-security" not in response.headers


@pytest.mark.asyncio
async def test_hsts_in_production() -> None:
    """HSTS header must be present in production."""
    app = _make_app(env="production")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ping")

    assert "strict-transport-security" in response.headers
    assert "max-age=31536000" in response.headers["strict-transport-security"]


@pytest.mark.asyncio
async def test_cors_wildcard_dev() -> None:
    """In development mode CORS must allow any origin."""
    app = _make_app(env="development")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.options(
            "/ping",
            headers={"Origin": "http://evil.example.com", "Access-Control-Request-Method": "GET"},
        )

    # Origin is reflected or wildcard is returned
    ac_origin = response.headers.get("access-control-allow-origin", "")
    assert ac_origin in ("*", "http://evil.example.com"), (
        f"Unexpected CORS origin header: {ac_origin!r}"
    )


@pytest.mark.asyncio
async def test_cors_restricted_prod() -> None:
    """In production mode only listed origins are reflected; bad origins are rejected."""
    app = _make_app(env="production", cors_origins="https://app.seeds.org,https://admin.seeds.org")

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        # Allowed origin
        resp_allowed = await client.options(
            "/ping",
            headers={
                "Origin": "https://app.seeds.org",
                "Access-Control-Request-Method": "GET",
            },
        )
        # Disallowed origin
        resp_denied = await client.options(
            "/ping",
            headers={
                "Origin": "http://evil.example.com",
                "Access-Control-Request-Method": "GET",
            },
        )

    allowed_origin = resp_allowed.headers.get("access-control-allow-origin", "")
    assert allowed_origin == "https://app.seeds.org"

    denied_origin = resp_denied.headers.get("access-control-allow-origin", "")
    assert denied_origin != "http://evil.example.com"


@pytest.mark.asyncio
async def test_error_envelope_format() -> None:
    """AppError must be wrapped in the standard error envelope."""
    app = _make_app(include_error_route=True)

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/raise-app-error")

    assert response.status_code == 400
    body = response.json()
    # Flat dual-key shape: data.error and data.message are both flat strings.
    assert body["error"] == "test message"
    assert body["message"] == "test message"
    assert body["code"] == "TEST_CODE"
    assert "request_id" in body


@pytest.mark.asyncio
async def test_unhandled_exception_sanitized() -> None:
    """500 response must NOT include stack traces or internal details.

    Starlette's ServerErrorMiddleware always re-raises the exception after
    sending the response (so test runners can observe it), so we use
    raise_server_exceptions=False in the transport and verify only the
    HTTP response body – not whether Python received an exception.
    """
    app = _make_app(include_unhandled_route=True)

    # raise_server_exceptions=False tells httpx not to re-raise the server
    # exception – we want to inspect the HTTP response instead.
    async with AsyncClient(
        transport=ASGITransport(app=app, raise_app_exceptions=False),
        base_url="http://test",
    ) as client:
        response = await client.get("/raise-unhandled")

    assert response.status_code == 500
    body = response.json()
    assert body["error"] == "Internal server error"
    assert body["message"] == "Internal server error"
    assert body["code"] == "INTERNAL_ERROR"
    # Must not contain stack trace indicators
    raw_text = response.text
    assert "Traceback" not in raw_text
    assert "traceback" not in raw_text
    assert "boom" not in raw_text  # original exception message must not leak


@pytest.mark.asyncio
async def test_request_id_propagated() -> None:
    """X-Request-ID must be present in every response."""
    app = _make_app()

    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.get("/ping")

    assert "x-request-id" in response.headers
    request_id = response.headers["x-request-id"]
    # Verify it looks like a UUID
    assert re.match(
        r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        request_id,
    ), f"X-Request-ID does not look like a UUID: {request_id!r}"


@pytest.mark.asyncio
async def test_rate_limit_applied() -> None:
    """The 429 exception handler must be registered on the app."""
    from slowapi.errors import RateLimitExceeded

    app = _make_app()
    # Verify the handler is registered
    assert RateLimitExceeded in app.exception_handlers


@pytest.mark.asyncio
async def test_rate_limit_429_response() -> None:
    """Manually trigger the 429 handler and confirm response shape."""
    from slowapi.errors import RateLimitExceeded

    app = _make_app()

    # Retrieve the registered handler directly and call it.
    # RateLimitExceeded requires a Limit object; use a MagicMock to avoid
    # constructing the full wrappers.Limit dependency graph.
    handler = app.exception_handlers[RateLimitExceeded]
    mock_request = MagicMock()
    mock_limit = MagicMock()
    exc = RateLimitExceeded.__new__(RateLimitExceeded)
    exc.limit = mock_limit

    response = await handler(mock_request, exc)
    assert response.status_code == 429
    body = json.loads(response.body)
    assert body["error"]["code"] == "RATE_LIMIT_EXCEEDED"


def test_sensitive_masking() -> None:
    """Log messages with sensitive data must be masked before emission."""
    from app.platform.logging import _JsonFormatter

    formatter = _JsonFormatter()

    # Phone number masking
    record_phone = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg="Calling +919876543210 now", args=(), exc_info=None,
    )
    output_phone = formatter.format(record_phone)
    assert "+919876543210" not in output_phone
    assert "***PHONE***" in output_phone

    # Password field masking
    record_pw = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg='{"password": "supersecret"}', args=(), exc_info=None,
    )
    output_pw = formatter.format(record_pw)
    assert "supersecret" not in output_pw

    # Bearer token masking
    record_token = logging.LogRecord(
        name="test", level=logging.INFO, pathname="", lineno=0,
        msg="Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig",
        args=(), exc_info=None,
    )
    output_token = formatter.format(record_token)
    assert "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9" not in output_token
    assert "Bearer ***" in output_token


def test_configure_logging_sets_json_handler() -> None:
    """configure_logging() must replace handlers with a JSON formatter."""
    from app.platform.logging import _JsonFormatter, configure_logging

    configure_logging(log_level="DEBUG")
    root = logging.getLogger()
    assert any(isinstance(h.formatter, _JsonFormatter) for h in root.handlers)
    assert root.level == logging.DEBUG
