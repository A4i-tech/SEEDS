"""
FastAPI dependency functions for authentication and authorisation.

SECURITY:
  - Token strings are never logged.
  - Auth failures increment the auth.failures telemetry counter.
  - Failure details are logged as structured JSON without the token value.
"""

from __future__ import annotations

import logging
from typing import Any, AsyncGenerator

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.database import get_database
from app.platform.error_handling import ForbiddenError, UnauthorizedError

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/token", auto_error=False)


# ---------------------------------------------------------------------------
# DB dependency
# ---------------------------------------------------------------------------


async def get_db() -> AsyncGenerator[AsyncIOMotorDatabase, None]:  # type: ignore[type-arg]
    """Yield the active Motor database instance."""
    yield get_database()


# ---------------------------------------------------------------------------
# Core user dependency
# ---------------------------------------------------------------------------


async def get_current_user(
    request: Request,
    token: str | None = Depends(oauth2_scheme),
) -> dict[str, Any]:
    """
    Verify the bearer token and return the decoded user payload.

    Supports both native JWT and Firebase ID tokens depending on
    settings.auth_type.

    Sets request.state.user_id and request.state.tenant_id for logging
    middleware correlation.

    Increments auth.failures counter and logs structured failure details on
    any auth error.  The token value is NEVER included in log messages.
    """
    from app.platform.settings import get_settings  # noqa: PLC0415
    from app.platform.telemetry import get_counter  # noqa: PLC0415

    settings = get_settings()
    auth_failures = get_counter("auth.failures")

    if not token:
        _log_auth_failure(request, "missing_token")
        auth_failures.add(1, {"reason": "missing_token"})
        raise UnauthorizedError("Missing authentication token")

    try:
        if settings.auth_type == "firebase":
            from app.platform.auth.providers.firebase_provider import (  # noqa: PLC0415
                verify_firebase_token,
            )

            firebase_payload = await verify_firebase_token(token)
            user: dict[str, Any] = {
                "sub": firebase_payload["uid"],
                "role": firebase_payload.get("role", ""),
                "tenant_id": firebase_payload.get("tenant_id", ""),
                "email": firebase_payload.get("email", ""),
            }
        else:
            from app.platform.auth.jwt import verify_token  # noqa: PLC0415

            user = verify_token(token)

    except UnauthorizedError:
        _log_auth_failure(request, "invalid_token")
        auth_failures.add(1, {"reason": "invalid_token"})
        raise
    except Exception as exc:  # noqa: BLE001
        logger.warning(
            "auth: unexpected verification error — %s",
            type(exc).__name__,
        )
        _log_auth_failure(request, "verification_error")
        auth_failures.add(1, {"reason": "verification_error"})
        raise UnauthorizedError("Authentication failed") from exc

    # Attach to request state for logging / telemetry middleware
    request.state.user_id = user.get("sub", "")
    request.state.tenant_id = user.get("tenant_id", "")

    return user


# ---------------------------------------------------------------------------
# Role-scoped dependencies
# ---------------------------------------------------------------------------


async def require_teacher(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Assert that the authenticated user has the 'teacher' role."""
    if user.get("role") != "teacher":
        raise ForbiddenError("teacher role required")
    return user


async def require_tenant(
    user: dict[str, Any] = Depends(get_current_user),
) -> dict[str, Any]:
    """Assert that the authenticated user has the 'tenant' role."""
    if user.get("role") != "tenant":
        raise ForbiddenError("tenant role required")
    return user


# ---------------------------------------------------------------------------
# Resource-ownership dependency
# ---------------------------------------------------------------------------


async def require_conference_owner(
    conference_id: str,
    user: dict[str, Any] = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_db),  # type: ignore[type-arg]
) -> dict[str, Any]:
    """
    Verify that the authenticated user is the owner (created_by) of the
    conference identified by *conference_id*.

    Raises ForbiddenError if they are not.
    """
    conference = await db["conferences"].find_one({"_id": conference_id})
    if conference is None:
        from app.platform.error_handling import NotFoundError  # noqa: PLC0415

        raise NotFoundError("Conference", conference_id)

    if str(conference.get("created_by", "")) != user.get("sub", ""):
        raise ForbiddenError("not conference owner")

    if str(conference.get("tenant_id", "")) != str(user.get("tenant_id", "")):
        raise ForbiddenError("conference tenant mismatch")

    return user


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _log_auth_failure(request: Request, reason: str) -> None:
    """Log a structured auth failure.  Token value is NEVER included."""
    client_ip = _get_client_ip(request)
    ua = request.headers.get("user-agent", "")
    logger.warning(
        "auth_failed",
        extra={
            "event": "auth_failed",
            "ip": client_ip,
            "user_agent": ua,
            "reason": reason,
        },
    )


def _get_client_ip(request: Request) -> str:
    forwarded_for = request.headers.get("x-forwarded-for", "")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    if request.client:
        return request.client.host
    return ""
