"""
Centralised error handling for SEEDS Platform.

Provides:
  - AppError hierarchy for domain-level exceptions
  - Global FastAPI exception handlers (no stack traces in responses)
  - register_error_handlers(app) convenience function
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from fastapi import Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

if TYPE_CHECKING:
    from fastapi import FastAPI

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Context var import (populated by logging middleware)
# ---------------------------------------------------------------------------

# Imported lazily to avoid circular imports at module load time.
def _get_request_id() -> str:
    try:
        from app.platform.logging import request_id_ctx_var  # noqa: PLC0415
        return request_id_ctx_var.get("")
    except Exception:  # pragma: no cover
        return ""


# ---------------------------------------------------------------------------
# AppError hierarchy
# ---------------------------------------------------------------------------


class AppError(Exception):
    """Base application error. All domain errors should extend this."""

    def __init__(
        self,
        code: str,
        message: str,
        status_code: int = 400,
        details: dict | None = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code
        self.details = details


class NotFoundError(AppError):
    def __init__(self, resource: str, id: str = "") -> None:  # noqa: A002
        super().__init__("NOT_FOUND", f"{resource} not found", 404)


class UnauthorizedError(AppError):
    def __init__(self, reason: str = "Invalid or missing token") -> None:
        super().__init__("UNAUTHORIZED", reason, 401)


class ForbiddenError(AppError):
    def __init__(self, action: str = "") -> None:
        super().__init__("FORBIDDEN", "Access denied", 403)


class ConflictError(AppError):
    def __init__(self, resource: str) -> None:
        super().__init__("CONFLICT", f"{resource} already exists", 409)


class ValidationError(AppError):
    def __init__(self, message: str) -> None:
        super().__init__("VALIDATION_ERROR", message, 422)


# ---------------------------------------------------------------------------
# Exception handlers
# ---------------------------------------------------------------------------


def _error_envelope(
    code: str,
    message: str,
    request_id: str,
    details: dict | None = None,
) -> dict:
    payload: dict = {"code": code, "message": message, "request_id": request_id}
    if details is not None:
        payload["details"] = details
    return {"error": payload}


async def _app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    request_id = _get_request_id()
    logger.warning(
        "AppError %s: %s (request_id=%s)",
        exc.code,
        exc.message,
        request_id,
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_envelope(exc.code, exc.message, request_id, exc.details),
    )


async def _validation_error_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    request_id = _get_request_id()
    logger.warning("RequestValidationError (request_id=%s): %s", request_id, exc.errors())
    return JSONResponse(
        status_code=422,
        content=_error_envelope(
            "VALIDATION_ERROR",
            "Request validation failed",
            request_id,
            {"validation_errors": exc.errors()},
        ),
    )


async def _unhandled_exception_handler(
    request: Request, exc: Exception
) -> JSONResponse:
    request_id = _get_request_id()
    # Log with full traceback on server side, but NEVER expose it in the response.
    logger.exception(
        "Unhandled exception (request_id=%s): %s",
        request_id,
        exc,
    )
    return JSONResponse(
        status_code=500,
        content=_error_envelope(
            "INTERNAL_ERROR",
            "Internal server error",
            request_id,
        ),
    )


# ---------------------------------------------------------------------------
# Registration helper
# ---------------------------------------------------------------------------


def register_error_handlers(app: "FastAPI") -> None:
    """Wire all exception handlers onto *app*."""
    app.add_exception_handler(AppError, _app_error_handler)
    app.add_exception_handler(RequestValidationError, _validation_error_handler)
    app.add_exception_handler(Exception, _unhandled_exception_handler)
