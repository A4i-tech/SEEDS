"""Unit tests for the shared refresh-token rotation engine (#459).

Exercises app.platform.auth.refresh_tokens directly against an in-memory
fake RefreshTokenStore, independent of any specific caller (Content
Aggregator or the shared user auth flow both delegate here).
"""
from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.platform.auth.refresh_tokens import (
    ConsumedToken,
    RefreshTokenExpiredError,
    RefreshTokenNotFoundError,
    RefreshTokenReusedError,
    issue_pair,
    rotate,
)
from app.platform.error_handling import AppError, UnauthorizedError
from app.platform.settings import Settings
from app.platform.telemetry import configure_telemetry


class FakeStore:
    """Minimal in-memory RefreshTokenStore for exercising the engine directly."""

    def __init__(self) -> None:
        self._tokens: dict[str, dict[str, Any]] = {}

    async def insert(self, *, token_id, owner_id, claims, expires_at, created_at) -> None:
        self._tokens[token_id] = {
            "owner_id": owner_id,
            "claims": claims,
            "expires_at": expires_at,
            "revoked": False,
        }

    async def try_consume(self, token_id: str) -> ConsumedToken:
        doc = self._tokens.get(token_id)
        if doc is None:
            raise RefreshTokenNotFoundError
        if doc["revoked"]:
            raise RefreshTokenReusedError(doc["owner_id"])
        if doc["expires_at"] <= datetime.now(tz=UTC):
            raise RefreshTokenExpiredError
        doc["revoked"] = True
        return ConsumedToken(
            owner_id=doc["owner_id"],
            claims=doc["claims"],
            expires_at=doc["expires_at"],
            revoked=doc["revoked"],
        )

    async def revoke_all_for_owner(self, owner_id: str) -> None:
        for doc in self._tokens.values():
            if doc["owner_id"] == owner_id:
                doc["revoked"] = True


@pytest.fixture(autouse=True)
def _telemetry():
    configure_telemetry(Settings(secret_key="test-secret-key-for-tests-32chars!!"))


async def _verify_owner_active(owner_id: str, claims: dict[str, Any]) -> dict[str, Any]:
    if claims.get("inactive"):
        raise AppError("TENANT_NOT_ALLOWED", "inactive", 403)
    return claims


async def _build_access_token(owner_id: str, claims: dict[str, Any]) -> tuple[str, int]:
    return f"access-for-{owner_id}", 900


async def _issue(store: FakeStore, owner_id: str = "user-1", claims: dict[str, Any] | None = None):
    return await issue_pair(
        store,
        owner_id=owner_id,
        claims=claims or {"role": "teacher"},
        access_token="initial-access-token",
        access_expires_in=86400,
        refresh_ttl="30d",
    )


class TestIssuePair:
    async def test_persists_new_token(self):
        store = FakeStore()
        result = await _issue(store)

        assert set(result.keys()) == {"access_token", "refresh_token", "expires_in", "token_type"}
        assert result["token_type"] == "Bearer"
        stored = store._tokens[result["refresh_token"]]
        assert stored["revoked"] is False


class TestRotate:
    async def test_rotation_returns_new_pair_and_revokes_old(self):
        store = FakeStore()
        issued = await _issue(store)
        old_refresh = issued["refresh_token"]

        result = await rotate(
            store,
            old_refresh,
            verify_owner_active=_verify_owner_active,
            build_access_token=_build_access_token,
            refresh_ttl="30d",
            reuse_counter_name="auth.reuse_detected",
        )

        assert result["refresh_token"] != old_refresh
        assert store._tokens[old_refresh]["revoked"] is True
        assert store._tokens[result["refresh_token"]]["revoked"] is False

    async def test_claims_carried_forward_unmodified(self):
        store = FakeStore()
        issued = await _issue(store, claims={"role": "teacher", "school_id": "s1"})

        await rotate(
            store,
            issued["refresh_token"],
            verify_owner_active=_verify_owner_active,
            build_access_token=_build_access_token,
            refresh_ttl="30d",
            reuse_counter_name="auth.reuse_detected",
        )

        new_token = next(
            doc for tid, doc in store._tokens.items() if not doc["revoked"]
        )
        assert new_token["claims"] == {"role": "teacher", "school_id": "s1"}

    async def test_unknown_token_raises_unauthorized(self):
        store = FakeStore()
        with pytest.raises(UnauthorizedError):
            await rotate(
                store,
                "does-not-exist",
                verify_owner_active=_verify_owner_active,
                build_access_token=_build_access_token,
                refresh_ttl="30d",
                reuse_counter_name="auth.reuse_detected",
            )

    async def test_replaying_consumed_token_revokes_all_tokens_for_owner(self):
        store = FakeStore()
        issued = await _issue(store)
        root_refresh = issued["refresh_token"]
        rotated = await rotate(
            store,
            root_refresh,
            verify_owner_active=_verify_owner_active,
            build_access_token=_build_access_token,
            refresh_ttl="30d",
            reuse_counter_name="auth.reuse_detected",
        )

        with pytest.raises(UnauthorizedError):
            await rotate(
                store,
                root_refresh,
                verify_owner_active=_verify_owner_active,
                build_access_token=_build_access_token,
                refresh_ttl="30d",
                reuse_counter_name="auth.reuse_detected",
            )

        with pytest.raises(UnauthorizedError):
            await rotate(
                store,
                rotated["refresh_token"],
                verify_owner_active=_verify_owner_active,
                build_access_token=_build_access_token,
                refresh_ttl="30d",
                reuse_counter_name="auth.reuse_detected",
            )

        assert all(doc["revoked"] for doc in store._tokens.values())

    async def test_replay_revokes_other_tokens_for_same_owner(self):
        """Reuse detection must revoke every token for the owner, not just the replayed one."""
        store = FakeStore()
        token_a = await _issue(store, owner_id="user-1")
        token_b = await _issue(store, owner_id="user-1")

        rotated_a = await rotate(
            store,
            token_a["refresh_token"],
            verify_owner_active=_verify_owner_active,
            build_access_token=_build_access_token,
            refresh_ttl="30d",
            reuse_counter_name="auth.reuse_detected",
        )

        with pytest.raises(UnauthorizedError):
            await rotate(
                store,
                token_a["refresh_token"],
                verify_owner_active=_verify_owner_active,
                build_access_token=_build_access_token,
                refresh_ttl="30d",
                reuse_counter_name="auth.reuse_detected",
            )

        assert store._tokens[rotated_a["refresh_token"]]["revoked"] is True
        assert store._tokens[token_b["refresh_token"]]["revoked"] is True

    async def test_concurrent_refresh_only_one_winner(self):
        store = FakeStore()
        issued = await _issue(store)
        root_refresh = issued["refresh_token"]

        results = await asyncio.gather(
            rotate(
                store,
                root_refresh,
                verify_owner_active=_verify_owner_active,
                build_access_token=_build_access_token,
                refresh_ttl="30d",
                reuse_counter_name="auth.reuse_detected",
            ),
            rotate(
                store,
                root_refresh,
                verify_owner_active=_verify_owner_active,
                build_access_token=_build_access_token,
                refresh_ttl="30d",
                reuse_counter_name="auth.reuse_detected",
            ),
            return_exceptions=True,
        )

        successes = [r for r in results if not isinstance(r, BaseException)]
        failures = [r for r in results if isinstance(r, BaseException)]
        assert len(successes) == 1
        assert len(failures) == 1
        assert isinstance(failures[0], UnauthorizedError)

    async def test_expired_token_raises_distinct_error_code(self):
        store = FakeStore()
        issued = await _issue(store)
        old_refresh = issued["refresh_token"]
        store._tokens[old_refresh] = replace_expiry(store._tokens[old_refresh])

        with pytest.raises(AppError) as exc_info:
            await rotate(
                store,
                old_refresh,
                verify_owner_active=_verify_owner_active,
                build_access_token=_build_access_token,
                refresh_ttl="30d",
                reuse_counter_name="auth.reuse_detected",
            )
        assert exc_info.value.code == "REFRESH_TOKEN_EXPIRED"
        assert exc_info.value.status_code == 401

    async def test_expired_unconsumed_token_does_not_trigger_mass_revocation(self):
        """A clean expiry (never rotated/replayed) must not be misread as reuse."""
        store = FakeStore()
        expired = await _issue(store, owner_id="user-1")
        other_token = await _issue(store, owner_id="user-1")
        expired_refresh = expired["refresh_token"]
        store._tokens[expired_refresh] = replace_expiry(store._tokens[expired_refresh])

        with pytest.raises(AppError) as exc_info:
            await rotate(
                store,
                expired_refresh,
                verify_owner_active=_verify_owner_active,
                build_access_token=_build_access_token,
                refresh_ttl="30d",
                reuse_counter_name="auth.reuse_detected",
            )
        assert exc_info.value.code == "REFRESH_TOKEN_EXPIRED"
        assert store._tokens[expired_refresh]["revoked"] is False
        assert store._tokens[other_token["refresh_token"]]["revoked"] is False

    async def test_inactive_owner_rejected(self):
        store = FakeStore()
        issued = await _issue(store, claims={"role": "teacher", "inactive": True})

        with pytest.raises(AppError) as exc_info:
            await rotate(
                store,
                issued["refresh_token"],
                verify_owner_active=_verify_owner_active,
                build_access_token=_build_access_token,
                refresh_ttl="30d",
                reuse_counter_name="auth.reuse_detected",
            )
        assert exc_info.value.code == "TENANT_NOT_ALLOWED"
        assert exc_info.value.status_code == 403


def replace_expiry(doc: dict[str, Any]) -> dict[str, Any]:
    doc = dict(doc)
    doc["expires_at"] = datetime.now(tz=UTC) - timedelta(days=1)
    return doc
