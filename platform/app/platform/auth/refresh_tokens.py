"""Shared refresh-token rotation engine.

Single implementation of single-use rotation + reuse detection, used by both
the Content Aggregator partner auth flow and the shared user auth flow
(teacher/tenant/school_admin). Callers supply a ``RefreshTokenStore`` plus two
callbacks (``verify_owner_active``, ``build_access_token``) — the rotation
algorithm itself (atomic claim, reuse-triggered owner-wide revoke, expiry
check) lives here exactly once.
"""
from __future__ import annotations

import logging
import secrets
from collections.abc import Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any, Protocol, TypedDict

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
class ConsumedToken:
    """What a store returns for a claimed/looked-up refresh token."""

    owner_id: str
    claims: dict[str, Any]
    expires_at: datetime
    revoked: bool


class RefreshTokenStore(Protocol):
    """Storage seam the rotation engine is parameterized over."""

    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        claims: dict[str, Any],
        expires_at: datetime,
        created_at: datetime,
    ) -> None: ...

    async def find_by_token_id(self, token_id: str) -> ConsumedToken | None: ...

    async def try_consume(self, token_id: str) -> ConsumedToken | None: ...

    async def revoke_all_for_owner(self, owner_id: str) -> None: ...


VerifyOwnerActive = Callable[[str, dict[str, Any]], Awaitable[dict[str, Any]]]
BuildAccessToken = Callable[[str, dict[str, Any]], Awaitable[tuple[str, int]]]


async def issue_pair(
    store: RefreshTokenStore,
    *,
    owner_id: str,
    claims: dict[str, Any],
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


async def rotate(
    store: RefreshTokenStore,
    refresh_token: str,
    *,
    verify_owner_active: VerifyOwnerActive,
    build_access_token: BuildAccessToken,
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
    consumed = await store.try_consume(refresh_token)

    if consumed is None:
        existing = await store.find_by_token_id(refresh_token)
        if existing is None:
            raise UnauthorizedError("Invalid refresh token")
        if not existing.revoked:
            # Unrevoked but excluded by try_consume's expiry filter: a clean
            # expiry, not a replay — do not treat it as reuse.
            raise AppError("REFRESH_TOKEN_EXPIRED", "Refresh token has expired", 401)
        logger.warning(
            "refresh_tokens: revoked refresh token replayed — owner_id=%s",
            existing.owner_id,
            extra={
                "event": "refresh_token_reuse_detected",
                "owner_id": existing.owner_id,
            },
        )
        get_counter(reuse_counter_name).add(1, {"owner_id": existing.owner_id})
        await store.revoke_all_for_owner(existing.owner_id)
        raise UnauthorizedError("Invalid refresh token")

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
