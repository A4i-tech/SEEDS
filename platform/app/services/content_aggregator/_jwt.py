from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import TypedDict

from jose import ExpiredSignatureError, JWTError, jwt

from app.platform.auth.jwt import parse_expires_delta
from app.platform.auth.refresh_tokens import RefreshTokenExpiredError
from app.platform.error_handling import UnauthorizedError

_ALGORITHM = "HS256"
_ISSUER = "content-aggregator"


class AccessTokenClaims(TypedDict):
    sub: str
    iss: str
    iat: datetime
    exp: datetime
    jti: str
    scope: str
    tenant_ids: list[str]
    client_name: str


class RefreshTokenClaims(TypedDict):
    sub: str
    iss: str
    iat: datetime
    exp: datetime
    jti: str
    scope: str
    tenant_ids: list[str]


def encode_access_token(
    *,
    client_id: str,
    tenant_ids: list[str],
    scopes: list[str],
    client_name: str,
    secret_key: str,
    expires_in: str,
) -> tuple[str, int]:
    delta = parse_expires_delta(expires_in)
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


def encode_refresh_token(
    *,
    client_id: str,
    tenant_ids: list[str],
    scope: str,
    secret_key: str,
    expires_in: str,
) -> tuple[str, str, datetime]:
    delta = parse_expires_delta(expires_in)
    now = datetime.now(tz=UTC)
    expire = now + delta
    jti = secrets.token_urlsafe(16)

    payload: RefreshTokenClaims = {
        "sub": client_id,
        "iss": _ISSUER,
        "iat": now,
        "exp": expire,
        "jti": jti,
        "scope": scope,
        "tenant_ids": tenant_ids,
    }
    token = jwt.encode(payload, secret_key, algorithm=_ALGORITHM)
    return token, jti, expire


def decode_refresh_token(token: str, secret_key: str) -> RefreshTokenClaims:
    try:
        return jwt.decode(
            token,
            secret_key,
            algorithms=[_ALGORITHM],
            issuer=_ISSUER,
            options={"require": ["sub", "exp", "jti", "scope", "tenant_ids"]},
        )
    except ExpiredSignatureError:
        raise RefreshTokenExpiredError from None
    except JWTError:
        raise UnauthorizedError("Invalid refresh token") from None
