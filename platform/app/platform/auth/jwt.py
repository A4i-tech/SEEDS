"""
JWT creation and verification for SEEDS Platform.

Ported from backend-server/src/auth/authenticateToken.js.

SECURITY:
  - Token strings are NEVER logged.
  - All JWT claims are validated (issuer, expiry).
  - Uses python-jose with HS256.
"""

from __future__ import annotations

import logging
import re
from datetime import UTC, datetime, timedelta
from typing import Any

from jose import ExpiredSignatureError, JWTError, jwt

from app.platform.error_handling import UnauthorizedError
from app.platform.settings import get_settings

logger = logging.getLogger(__name__)

_ALGORITHM = "HS256"
_ISSUER = "platform"


# ---------------------------------------------------------------------------
# Expiry parsing helper
# ---------------------------------------------------------------------------


def _parse_expires_delta(value: str) -> timedelta:
    """
    Parse *value* into a timedelta.

    Accepted formats:
      "7d"    → 7 days
      "24h"   → 24 hours
      "3600"  → 3600 seconds (plain integer string)
      "1d"    → 1 day
    """
    value = value.strip()
    match = re.fullmatch(r"(\d+)\s*([dhms]?)", value, re.IGNORECASE)
    if not match:
        raise ValueError(f"Cannot parse jwt_expires_in value: {value!r}")

    amount = int(match.group(1))
    unit = (match.group(2) or "s").lower()

    if unit == "d":
        return timedelta(days=amount)
    if unit == "h":
        return timedelta(hours=amount)
    if unit == "m":
        return timedelta(minutes=amount)
    # default: seconds
    return timedelta(seconds=amount)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


def create_access_token(
    data: dict[str, Any],
    expires_delta: timedelta | None = None,
) -> str:
    """
    Create a signed JWT.

    Required keys in *data*:
      sub        – subject identifier (user id)
      role       – user role string

    Optional keys in *data*:
      tenant_id
      school_id

    The token will include:
      iss = "platform"
      iat = now (UTC)
      exp = now + expires_delta (or settings.jwt_expires_in)
    """
    settings = get_settings()

    if expires_delta is None:
        expires_delta = _parse_expires_delta(settings.jwt_expires_in)

    now = datetime.now(tz=UTC)
    expire = now + expires_delta

    payload: dict[str, Any] = {
        "sub": data["sub"],
        "role": data["role"],
        "iss": _ISSUER,
        "iat": now,
        "exp": expire,
    }

    # Optional claims
    if "tenant_id" in data and data["tenant_id"] is not None:
        payload["tenant_id"] = data["tenant_id"]
    if "school_id" in data and data["school_id"] is not None:
        payload["school_id"] = data["school_id"]

    return jwt.encode(payload, settings.secret_key, algorithm=_ALGORITHM)


def verify_token(token: str) -> dict[str, Any]:
    """
    Verify and decode *token*.

    Validates:
      - Signature
      - Expiry
      - Issuer == "platform"

    Returns the decoded payload dict on success.
    Raises UnauthorizedError on any failure.

    SECURITY: the token value is never included in log messages.
    """
    settings = get_settings()

    try:
        payload: dict[str, Any] = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[_ALGORITHM],
            issuer=_ISSUER,
            options={"require": ["sub", "exp", "iss"]},
        )
    except ExpiredSignatureError:
        logger.warning("auth: token expired")
        raise UnauthorizedError("Token has expired")
    except JWTError as exc:
        logger.warning("auth: token verification failed — %s", exc)
        raise UnauthorizedError("Invalid token")

    # Extra issuer guard (python-jose validates issuer via the issuer= kwarg,
    # but we double-check for defence-in-depth).
    if payload.get("iss") != _ISSUER:
        logger.warning("auth: wrong issuer '%s'", payload.get("iss"))
        raise UnauthorizedError("Invalid token issuer")

    return payload
