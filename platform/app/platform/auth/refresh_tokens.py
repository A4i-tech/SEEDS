from __future__ import annotations

import secrets
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol, TypedDict

from pydantic import PositiveInt

from app.platform.auth.jwt import parse_expires_delta
from app.platform.error_handling import AppError, UnauthorizedError


def generate_refresh_token() -> str:
    return secrets.token_urlsafe(32)


class TokenPair(TypedDict):
    access_token: str
    refresh_token: str
    expires_in: PositiveInt
    token_type: str


@dataclass(frozen=True)
class ConsumedToken[ClaimsT]:
    owner_id: str
    claims: ClaimsT
    family_expires_at: datetime


class RefreshTokenInvalidError(UnauthorizedError):
    def __init__(self) -> None:
        super().__init__("Invalid refresh token")


class RefreshTokenExpiredError(AppError):
    def __init__(self) -> None:
        super().__init__("REFRESH_TOKEN_EXPIRED", "Refresh token has expired", 401)


class RefreshTokenStore[ClaimsT](Protocol):
    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        claims: ClaimsT,
        expires_at: datetime,
        family_expires_at: datetime,
        created_at: datetime,
    ) -> None: ...

    async def try_consume(self, token_id: str) -> ConsumedToken[ClaimsT]: ...

    async def revoke_all_for_owner(self, owner_id: str, *, reason: str) -> None: ...


type VerifyOwnerActive[ClaimsT] = Callable[[str, ClaimsT], Awaitable[ClaimsT]]
type BuildAccessToken[ClaimsT] = Callable[[str, ClaimsT], tuple[str, int]]


async def issue_pair[ClaimsT](
    store: RefreshTokenStore[ClaimsT],
    *,
    owner_id: str,
    claims: ClaimsT,
    access_token: str,
    access_expires_in: int,
    refresh_ttl: str,
) -> TokenPair:
    refresh_token = generate_refresh_token()
    now = datetime.now(tz=UTC)
    expires_at = now + parse_expires_delta(refresh_ttl)
    await store.insert(
        token_id=refresh_token,
        owner_id=owner_id,
        claims=claims,
        expires_at=expires_at,
        family_expires_at=expires_at,
        created_at=now,
    )
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
        "expires_in": access_expires_in,
        "token_type": "Bearer",
    }


async def rotate[ClaimsT](
    store: RefreshTokenStore[ClaimsT],
    refresh_token: str,
    *,
    verify_owner_active: VerifyOwnerActive[ClaimsT],
    build_access_token: BuildAccessToken[ClaimsT],
    refresh_ttl: str,
) -> tuple[TokenPair, ClaimsT]:
    consumed = await store.try_consume(refresh_token)

    now = datetime.now(tz=UTC)
    claims = await verify_owner_active(consumed.owner_id, consumed.claims)

    access_token, access_expires_in = build_access_token(consumed.owner_id, claims)

    new_refresh_token = generate_refresh_token()
    new_expires_at = min(now + parse_expires_delta(refresh_ttl), consumed.family_expires_at)
    await store.insert(
        token_id=new_refresh_token,
        owner_id=consumed.owner_id,
        claims=claims,
        expires_at=new_expires_at,
        family_expires_at=consumed.family_expires_at,
        created_at=now,
    )

    pair: TokenPair = {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "expires_in": access_expires_in,
        "token_type": "Bearer",
    }
    return pair, claims
