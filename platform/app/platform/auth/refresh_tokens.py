from __future__ import annotations

import logging
import secrets
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Protocol, TypedDict

from pydantic import PositiveInt

from app.platform.auth.jwt import _parse_expires_delta
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.telemetry import get_counter

logger = logging.getLogger(__name__)


def generate_refresh_token() -> str:
    """Opaque, unguessable refresh token — also used as the store's token_id."""
    return secrets.token_urlsafe(32)


def refresh_token_expiry(expires_in: str) -> datetime:
    return datetime.now(tz=UTC) + _parse_expires_delta(expires_in)


class TokenPair(TypedDict):
    """Access + refresh token pair returned by ``issue_pair``/``rotate``."""

    access_token: str
    refresh_token: str
    expires_in: PositiveInt
    token_type: str


@dataclass(frozen=True)
class ConsumedToken[ClaimsT]:
    """What a store returns for a claimed refresh token."""

    owner_id: str
    claims: ClaimsT
    expires_at: datetime
    revoked: bool


class RefreshTokenNotFoundError(Exception):
    """Raised by ``try_consume`` for an unknown token_id."""


class RefreshTokenExpiredError(Exception):
    """Raised by ``try_consume`` for an expired, never-consumed token."""


class RefreshTokenReusedError(Exception):
    """Raised by ``try_consume`` for an already-consumed/revoked token."""

    def __init__(self, owner_id: str) -> None:
        super().__init__(f"Refresh token already consumed — owner_id={owner_id}")
        self.owner_id = owner_id


class RefreshTokenStore[ClaimsT](Protocol):
    """Storage seam the rotation engine is parameterized over."""

    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        claims: ClaimsT,
        expires_at: datetime,
        created_at: datetime,
    ) -> None: ...

    async def try_consume(self, token_id: str) -> ConsumedToken[ClaimsT]:
        """Atomically claim an unrevoked, unexpired token for rotation.

        Raises:
            RefreshTokenNotFoundError: no token matches ``token_id``.
            RefreshTokenExpiredError: token exists, never consumed, past expiry.
            RefreshTokenReusedError: token exists but already consumed/revoked.
        """
        ...

    async def revoke_all_for_owner(self, owner_id: str) -> None: ...


type VerifyOwnerActive[ClaimsT] = Callable[[str, ClaimsT], Awaitable[ClaimsT]]
type BuildAccessToken[ClaimsT] = Callable[[str, ClaimsT], Awaitable[tuple[str, int]]]


async def issue_pair[ClaimsT](
    store: RefreshTokenStore[ClaimsT],
    *,
    owner_id: str,
    claims: ClaimsT,
    access_token: str,
    access_expires_in: int,
    refresh_ttl: str,
) -> TokenPair:
    """Persist a new refresh token and return an access+refresh pair."""
    refresh_token = generate_refresh_token()
    now = datetime.now(tz=UTC)
    await store.insert(
        token_id=refresh_token,
        owner_id=owner_id,
        claims=claims,
        expires_at=refresh_token_expiry(refresh_ttl),
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
    reuse_counter_name: str,
) -> TokenPair:
    """Exchange a refresh token for a new access + refresh token pair.

    Single-use rotation: the presented token is atomically claimed
    (revoked=False -> True in one update) as part of a successful refresh, so
    two concurrent requests for the same token can never both win — the loser
    is treated as reuse. Replaying any already-consumed token (whether by a
    prior rotation or a losing concurrent request) revokes every token for
    that owner and logs/counts a security event.

    Raises:
        UnauthorizedError: token unknown or already consumed/revoked.
        AppError(code="REFRESH_TOKEN_EXPIRED"): token was claimed but already
            past its expiry.
        AppError: whatever ``verify_owner_active`` raises for an inactive owner.
    """
    try:
        consumed = await store.try_consume(refresh_token)
    except RefreshTokenNotFoundError:
        raise UnauthorizedError("Invalid refresh token") from None
    except RefreshTokenExpiredError:
        raise AppError("REFRESH_TOKEN_EXPIRED", "Refresh token has expired", 401) from None
    except RefreshTokenReusedError as exc:
        logger.warning(
            "refresh_tokens: revoked refresh token replayed — owner_id=%s",
            exc.owner_id,
            extra={
                "event": "refresh_token_reuse_detected",
                "owner_id": exc.owner_id,
            },
        )
        get_counter(reuse_counter_name).add(1, {"owner_id": exc.owner_id})
        await store.revoke_all_for_owner(exc.owner_id)
        raise UnauthorizedError("Invalid refresh token") from None

    now = datetime.now(tz=UTC)
    claims = await verify_owner_active(consumed.owner_id, consumed.claims)

    access_token, access_expires_in = await build_access_token(consumed.owner_id, claims)

    new_refresh_token = generate_refresh_token()
    await store.insert(
        token_id=new_refresh_token,
        owner_id=consumed.owner_id,
        claims=claims,
        expires_at=refresh_token_expiry(refresh_ttl),
        created_at=now,
    )

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "expires_in": access_expires_in,
        "token_type": "Bearer",
    }
