"""
Structured JSON logging and request-ID middleware for SEEDS Platform.

Provides:
  - request_id_ctx_var  – contextvars.ContextVar propagated per request
  - user_id_ctx_var     – set by auth dependencies for log enrichment
  - tenant_id_ctx_var   – set by auth dependencies for log enrichment
  - RequestIdMiddleware – injects request-ID, logs request completion
  - configure_logging() – installs JSON formatter with sensitive-data masking
"""

from __future__ import annotations

import contextvars
import json
import logging
import re
import time
import uuid
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    pass

# ---------------------------------------------------------------------------
# Context variables
# ---------------------------------------------------------------------------

request_id_ctx_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "request_id", default=""
)
user_id_ctx_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "user_id", default=""
)
tenant_id_ctx_var: contextvars.ContextVar[str] = contextvars.ContextVar(
    "tenant_id", default=""
)

# ---------------------------------------------------------------------------
# Sensitive-data masking patterns
# ---------------------------------------------------------------------------

_MASK_PATTERNS: list[tuple[re.Pattern, str]] = [
    # Phone numbers: 10-15 digit strings (optionally prefixed with +)
    (re.compile(r"\+?[0-9]{10,15}"), "***PHONE***"),
    # JSON password fields
    (re.compile(r'("password"\s*:\s*")[^"]*"'), r'\1***"'),
    # Bearer tokens in Authorization headers / log strings
    (re.compile(r"(Bearer\s+)[A-Za-z0-9._\-]+"), r"\1***"),
    # JWT "sub" field values
    (re.compile(r'"sub"\s*:\s*"[^"]*"'), '"sub":"***"'),
    # JWT "jti" field values
    (re.compile(r'"jti"\s*:\s*"[^"]*"'), '"jti":"***"'),
]


def _mask_sensitive(text: str) -> str:
    for pattern, replacement in _MASK_PATTERNS:
        text = pattern.sub(replacement, text)
    return text


# ---------------------------------------------------------------------------
# JSON log formatter
# ---------------------------------------------------------------------------


class _JsonFormatter(logging.Formatter):
    """Emit each log record as a single JSON line."""

    def format(self, record: logging.LogRecord) -> str:  # noqa: A003
        message = record.getMessage()
        if record.exc_info:
            message = f"{message}\n{self.formatException(record.exc_info)}"

        # Mask sensitive data before emitting
        message = _mask_sensitive(message)

        payload = {
            "timestamp": self.formatTime(record, self.datefmt),
            "level": record.levelname,
            "logger": record.name,
            "message": message,
            "request_id": request_id_ctx_var.get(""),
            "user_id": user_id_ctx_var.get(""),
            "tenant_id": tenant_id_ctx_var.get(""),
        }
        return json.dumps(payload, ensure_ascii=False)


# ---------------------------------------------------------------------------
# Request-ID middleware
# ---------------------------------------------------------------------------


class RequestIdMiddleware:
    """
    Pure ASGI middleware – avoids the BaseHTTPMiddleware.call_next limitation
    where unhandled exceptions bypass FastAPI exception handlers.

    Per-request lifecycle:
      1. Generate a UUID for the request and store in request_id_ctx_var.
      2. Expose it via the X-Request-ID response header.
      3. Log request completion with method, path, status, and duration.
    """

    def __init__(self, app) -> None:  # noqa: ANN001
        self.app = app

    async def __call__(self, scope, receive, send) -> None:  # noqa: ANN001
        if scope["type"] not in ("http", "websocket"):
            await self.app(scope, receive, send)
            return

        request_id = str(uuid.uuid4())
        token = request_id_ctx_var.set(request_id)
        start = time.monotonic()
        status_code = 500

        async def _send_with_header(message) -> None:  # noqa: ANN001
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
                # Inject X-Request-ID into response headers
                headers = list(message.get("headers", []))
                headers.append(
                    (b"x-request-id", request_id.encode())
                )
                message = {**message, "headers": headers}
            await send(message)

        try:
            await self.app(scope, receive, _send_with_header)
        finally:
            duration_ms = round((time.monotonic() - start) * 1000, 2)
            _logger = logging.getLogger("seeds.request")
            path = scope.get("path", "")
            method = scope.get("method", "")
            _logger.info(
                json.dumps(
                    {
                        "event": "request",
                        "method": method,
                        "path": path,
                        "status": status_code,
                        "duration_ms": duration_ms,
                        "request_id": request_id,
                    }
                )
            )
            request_id_ctx_var.reset(token)


# ---------------------------------------------------------------------------
# Logging configuration
# ---------------------------------------------------------------------------


def configure_logging(log_level: str = "INFO") -> None:
    """
    Install the JSON formatter on the root logger.

    Call once at application startup (module level in main.py) before
    any other logger is used.
    """
    handler = logging.StreamHandler()
    handler.setFormatter(_JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)

    numeric_level = getattr(logging, log_level.upper(), logging.INFO)
    root.setLevel(numeric_level)

    # Quieten noisy third-party loggers
    for noisy in ("uvicorn.access", "httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)
