from __future__ import annotations

import secrets
from datetime import UTC, datetime
from typing import TypedDict

from jose import jwt

from app.platform.auth.jwt import _parse_expires_delta

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


def encode_access_token(
    *,
    client_id: str,
    tenant_ids: list[str],
    scopes: list[str],
    client_name: str,
    secret_key: str,
    expires_in: str,
) -> tuple[str, int]:
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
