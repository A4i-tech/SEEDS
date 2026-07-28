"""
SEEDS Platform - FastAPI application entry point.

APP_MODE controls what is mounted:
  api:      controllers + /health, no consumers
  consumer: /health only + consumers as background asyncio tasks
  all:      both (default, used for local dev)
"""

from __future__ import annotations

import opentelemetry.instrumentation.fastapi as _otel_fastapi
from fastapi import FastAPI
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor

from app.platform.error_handling import register_error_handlers
from app.platform.health import health_router
from app.platform.lifespan import lifespan
from app.platform.logging import RequestIdMiddleware, configure_logging
from app.platform.security import setup_security
from app.platform.settings import get_settings
from app.platform.telemetry import configure_telemetry
from app.router import api_router

settings = get_settings()

# Configure structured JSON logging before any log calls are made.
configure_logging(log_level=settings.log_level)

# Configure Azure Monitor telemetry (no-op when connection string is absent).
configure_telemetry(settings)

app = FastAPI(
    title="SEEDS Platform",
    version=settings.version,
    lifespan=lifespan,
    # Disable interactive docs in production
    docs_url=None if settings.env == "production" else "/docs",
    redoc_url=None if settings.env == "production" else "/redoc",
    openapi_url=None if settings.env == "production" else "/openapi.json",
)

# opentelemetry-instrumentation-fastapi 0.61b0's _get_route_details() only
# guards the AttributeError on Match.FULL routes, not Match.PARTIAL ones
# (e.g. Mount-based routes without a .path attribute). Unpatched, that raises
# on every request before CORSMiddleware runs, so browsers see it as a CORS
# failure instead of a 500. Patch in the same guard for Match.PARTIAL.
_otel_get_route_details = _otel_fastapi._get_route_details


def _safe_get_route_details(scope):
    try:
        return _otel_get_route_details(scope)
    except AttributeError:
        return scope.get("path")


_otel_fastapi._get_route_details = _safe_get_route_details

FastAPIInstrumentor.instrument_app(app)

# ---------------------------------------------------------------------------
# Middleware (order matters – FastAPI reverses add_middleware calls, so the
# LAST add_middleware call wraps the outermost layer on the wire).
#
# Wire order on the wire (outermost → innermost):
#   CORSMiddleware          (handles OPTIONS preflight before anything else)
#   SecurityHeadersMiddleware
#   RequestIdMiddleware     (injects request-ID for logging & error responses)
#   actual route handler
# ---------------------------------------------------------------------------

# setup_security adds CORSMiddleware (outermost) and SecurityHeadersMiddleware.
setup_security(app, settings)

# RequestIdMiddleware is innermost – added last so it wraps handlers directly.
app.add_middleware(RequestIdMiddleware)

# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------
register_error_handlers(app)

# ---------------------------------------------------------------------------
# Routers
# ---------------------------------------------------------------------------

# Health endpoint is always mounted
app.include_router(health_router)

# API controllers are only mounted in api / all mode
if settings.app_mode in ("api", "all"):
    app.include_router(api_router)
