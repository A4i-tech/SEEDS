"""
Unit tests for the platform foundation layer.

Uses httpx.AsyncClient with ASGI transport - no real DB or consumers needed.
"""

from __future__ import annotations

import sys
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_app(app_mode: str = "all", env: str = "development") -> FastAPI:
    """
    Build a fresh FastAPI app with the given settings overrides.
    Consumers are mocked so no real Azure/Service Bus connections are opened.
    """
    from app.platform.settings import Settings

    mock_settings = Settings(
        app_mode=app_mode,
        env=env,
        mongo_db_connection_string="",  # no real DB in unit tests
    )

    @asynccontextmanager
    async def _noop_lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
        app.state.consumer_tasks = []
        yield

    from app.platform.health import health_router
    from app.router import api_router

    _app = FastAPI(
        title="Test App",
        lifespan=_noop_lifespan,
        docs_url="/docs" if env != "production" else None,
    )

    # Patch get_settings inside health module so it returns our mock
    with patch("app.platform.health.get_settings", return_value=mock_settings):
        _app.include_router(health_router)

    if app_mode in ("api", "all"):
        _app.include_router(api_router)

    # Store mock_settings on app for assertions in tests
    _app.state.mock_settings = mock_settings
    return _app, mock_settings


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------

@pytest.mark.asyncio
async def test_health_returns_200() -> None:
    """GET /health should return 200 with status=ok and mode present."""
    app, settings = _make_app(app_mode="all", env="development")

    with patch("app.platform.health.get_settings", return_value=settings):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert "mode" in body


@pytest.mark.asyncio
async def test_health_omits_version_in_production() -> None:
    """GET /health in production mode must NOT include 'version' in the response."""
    app, settings = _make_app(app_mode="api", env="production")

    with patch("app.platform.health.get_settings", return_value=settings):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/health")

    assert response.status_code == 200
    body = response.json()
    assert "version" not in body


@pytest.mark.asyncio
async def test_health_includes_version_in_development() -> None:
    """GET /health in development mode SHOULD include 'version'."""
    app, settings = _make_app(app_mode="all", env="development")

    with patch("app.platform.health.get_settings", return_value=settings):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/health")

    body = response.json()
    assert "version" in body


@pytest.mark.asyncio
async def test_api_router_not_mounted_in_consumer_mode() -> None:
    """
    In consumer mode the API controllers are NOT mounted.
    A request to a controller path (e.g. /teacher) should return 404.
    """
    app, settings = _make_app(app_mode="consumer", env="development")

    with patch("app.platform.health.get_settings", return_value=settings):
        async with AsyncClient(
            transport=ASGITransport(app=app), base_url="http://test"
        ) as client:
            response = await client.get("/teacher")

    assert response.status_code == 404


@pytest.mark.asyncio
async def test_settings_defaults() -> None:
    """Settings() should load without an env file; app_mode defaults to 'all'."""
    import os

    from app.platform.settings import Settings

    # Remove APP_MODE if set by integration test env (they use setdefault("api"))
    old = os.environ.pop("APP_MODE", None)
    try:
        s = Settings()
        assert s.app_mode == "all"
    finally:
        if old is not None:
            os.environ["APP_MODE"] = old
    assert s.env == "development"
    assert s.version == "0.1.0"
    assert s.mongo_max_pool_size == 50


def test_database_not_init_at_import() -> None:
    """
    Importing database module must NOT create a Motor client.
    The _client and _database module-level vars should remain None until
    init_database() is explicitly called.
    """
    # Force a fresh import by removing cached module
    mod_name = "app.platform.database"
    if mod_name in sys.modules:
        del sys.modules[mod_name]

    import app.platform.database as db_module  # noqa: PLC0415

    assert db_module._client is None
    assert db_module._database is None
