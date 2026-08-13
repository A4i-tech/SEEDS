"""Private JWT helper for the Content Aggregator partner auth flow.

Not imported anywhere outside this package — ``auth.py`` is the only caller.
Encapsulation pattern per issue #458: this is the single place that imports
the JWT library, so swapping libraries later never touches controllers/services.

SECURITY: token strings and claims are never logged.
"""
from __future__ import annotations

from datetime import UTC, datetime
from typing import TypedDict

from jose import ExpiredSignatureError, JWTError, jwt

from app.platform.auth.jwt import _parse_expires_delta
from app.platform.error_handling import UnauthorizedError

_ALGORITHM = "HS256"
_ISSUER = "content-aggregator"


class AccessTokenClaims(TypedDict):
    """Shape of the Content Aggregator access-token JWT payload."""

    client_id: str
    tenant_ids: list[str]
    scopes: list[str]
    iss: str
    iat: datetime
    exp: datetime


def encode_access_token(
    *,
    client_id: str,
    tenant_ids: list[str],
    scopes: list[str],
    secret_key: str,
    expires_in: str,
) -> tuple[str, int]:
    """Return (token, expires_in_seconds)."""
    delta = _parse_expires_delta(expires_in)
    now = datetime.now(tz=UTC)
    expire = now + delta

    payload: AccessTokenClaims = {
        "client_id": client_id,
        "tenant_ids": tenant_ids,
        "scopes": scopes,
        "iss": _ISSUER,
        "iat": now,
        "exp": expire,
    }
    token = jwt.encode(payload, secret_key, algorithm=_ALGORITHM)
    return token, int(delta.total_seconds())


def decode_access_token(token: str, *, secret_key: str) -> AccessTokenClaims:
    try:
        return jwt.decode(
            token,
            secret_key,
            algorithms=[_ALGORITHM],
            issuer=_ISSUER,
            options={"require": ["client_id", "tenant_ids", "exp", "iss"]},
        )
    except ExpiredSignatureError:
        raise UnauthorizedError("Token has expired")
    except JWTError:
        raise UnauthorizedError("Invalid token")
