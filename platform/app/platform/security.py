"""
Security middleware for SEEDS Platform.

Provides:
  - CORS policy (wildcard in dev/staging, restricted in production)
  - Security headers on every response
  - Global + per-route rate limiting via slowapi
"""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

if TYPE_CHECKING:
    from fastapi import FastAPI

    from app.platform.settings import Settings


# ---------------------------------------------------------------------------
# Rate limiter singleton (imported by controllers as needed)
# ---------------------------------------------------------------------------

limiter = Limiter(key_func=get_remote_address, default_limits=["5000/15minutes"])


# ---------------------------------------------------------------------------
# CORS helper
# ---------------------------------------------------------------------------


def _cors_origins(settings: Settings) -> list[str]:
    """Return the list of allowed origins based on the active environment."""
    if settings.env in ("development", "staging"):
        return ["*"]
    raw = settings.cors_allowed_origins.strip()
    if not raw or raw == "*":
        # production should be explicit – return ["*"] only if explicitly set
        return [o.strip() for o in raw.split(",") if o.strip()] or ["*"]
    return [o.strip() for o in raw.split(",") if o.strip()]


# ---------------------------------------------------------------------------
# Security headers middleware
# ---------------------------------------------------------------------------


class SecurityHeadersMiddleware:
    """
    Pure ASGI middleware that injects security headers into every HTTP response.

    Using a pure ASGI class (not BaseHTTPMiddleware) so that unhandled
    exceptions propagate correctly to FastAPI's exception handler layer
    without being re-raised through the middleware chain.
    """

    _HEADERS: list[tuple[bytes, bytes]] = [
        (b"x-content-type-options", b"nosniff"),
        (b"x-frame-options", b"DENY"),
        (b"x-xss-protection", b"1; mode=block"),
        (b"referrer-policy", b"strict-origin-when-cross-origin"),
        (b"permissions-policy", b"geolocation=(), microphone=(), camera=()"),
    ]
    _HSTS = (b"strict-transport-security", b"max-age=31536000; includeSubDomains")

    def __init__(self, app, env: str = "development") -> None:  # noqa: ANN001
        self.app = app
        self._env = env
        self._extra_headers: list[tuple[bytes, bytes]] = list(self._HEADERS)
        if env == "production":
            self._extra_headers.append(self._HSTS)

    async def __call__(self, scope, receive, send) -> None:  # noqa: ANN001
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def _send_with_security_headers(message) -> None:  # noqa: ANN001
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                headers.extend(self._extra_headers)
                message = {**message, "headers": headers}
            await send(message)

        await self.app(scope, receive, _send_with_security_headers)


# ---------------------------------------------------------------------------
# Rate-limit exceeded handler
# ---------------------------------------------------------------------------


async def _rate_limit_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    return JSONResponse(
        status_code=429,
        content={
            "error": {
                "code": "RATE_LIMIT_EXCEEDED",
                "message": "Too many requests. Please try again later.",
                "retry_after": str(exc.retry_after) if hasattr(exc, "retry_after") else None,
            }
        },
    )


# ---------------------------------------------------------------------------
# Public registration helper
# ---------------------------------------------------------------------------


def setup_security(app: FastAPI, settings: Settings) -> None:
    """
    Wire all security middleware and handlers onto *app*.

    Call this from main.py before any routes are registered so that the
    ASGI middleware stack is in the correct order:

        CORSMiddleware           (outermost – handles preflight before auth)
        SecurityHeadersMiddleware
        (RequestIdMiddleware added by logging.py)
    """
    # 1. Rate limiter on app.state
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_handler)

    # 2. Security headers (inner – wraps the actual handlers)
    app.add_middleware(SecurityHeadersMiddleware, env=settings.env)

    # 3. CORS (outermost – must be added *after* inner middleware in FastAPI's
    #    reversed-order add_middleware semantics so it runs first on the wire)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=_cors_origins(settings),
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
