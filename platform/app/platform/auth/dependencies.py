"""
FastAPI dependency functions for authentication and authorisation.

SECURITY:
  - Token strings are never logged.
  - Auth failures increment the auth.failures telemetry counter.
  - Failure details are logged as structured JSON without the token value.
"""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import Depends, Request
from fastapi.security import OAuth2PasswordBearer
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.auth.jwt import verify_token
from app.platform.auth.providers.firebase_provider import verify_firebase_token
from app.platform.database import get_database
from app.platform.error_handling import ForbiddenError, NotFoundError, UnauthorizedError
from app.platform.settings import get_settings
from app.platform.telemetry import get_counter
from app.repositories.conference_repository import ConferenceOwnershipRepository

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
    settings = get_settings()
    auth_failures = get_counter("auth.failures")

    if not token:
        _log_auth_failure(request, "missing_token")
        auth_failures.add(1, {"reason": "missing_token"})
        raise UnauthorizedError("Missing authentication token")

    try:
        if settings.auth_type == "firebase":
            firebase_payload = await verify_firebase_token(token)
            user: dict[str, Any] = {
                "sub": firebase_payload["uid"],
                "role": firebase_payload.get("role", ""),
                "tenant_id": firebase_payload.get("tenant_id", ""),
                "email": firebase_payload.get("email", ""),
            }
        else:
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


def require_role(*roles: str):
    """Factory returning a FastAPI dependency that asserts the user has one of *roles*.

    Usage: Depends(require_role("teacher", "content_creator"))
    Replaces ad-hoc per-combination async functions — scales to any role set.
    """
    role_set = frozenset(roles)

    async def _check(user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
        if user.get("role") not in role_set:
            raise ForbiddenError(f"one of {sorted(role_set)} role required")
        return user

    return _check


# Convenience aliases kept for backward compatibility with existing Depends() callsites.
require_teacher = require_role("teacher")
require_tenant = require_role("tenant")


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
    conference = await ConferenceOwnershipRepository(db).find_by_id(conference_id)
    if conference is None:
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
