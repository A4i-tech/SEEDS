from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import TypedDict

from jose import ExpiredSignatureError, JWTError, jwt

from app.platform.auth.jwt import _parse_expires_delta
from app.platform.error_handling import UnauthorizedError

_ALGORITHM = "HS256"
_ISSUER = "content-aggregator"


class AccessTokenClaims(TypedDict):
    """Shape of the Content Aggregator access-token JWT payload.

    Per the Content Aggregators Integration spec §2.3.4.
    """

    sub: str
    iss: str
    iat: datetime
    exp: datetime
    jti: str
    scope: str
    tenant_ids: list[str]
    client_name: str


def encode_access_token(
    *,
    client_id: str,
    tenant_ids: list[str],
    scopes: list[str],
    client_name: str,
    secret_key: str,
    expires_in: str,
) -> tuple[str, int]:
    """Return (token, expires_in_seconds)."""
    delta = _parse_expires_delta(expires_in)
    now = datetime.now(tz=UTC)
    expire = now + delta

    payload: AccessTokenClaims = {
        "sub": client_id,
        "iss": _ISSUER,
        "iat": now,
        "exp": expire,
        "jti": secrets.token_urlsafe(16),
        "scope": " ".join(scopes),
        "tenant_ids": tenant_ids,
        "client_name": client_name,
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
            options={"require": ["sub", "tenant_ids", "exp", "iss", "jti", "scope", "client_name"]},
        )
    except ExpiredSignatureError:
        raise UnauthorizedError("Token has expired")
    except JWTError:
        raise UnauthorizedError("Invalid token")
