from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta
from typing import cast

from pymongo.asynchronous.database import AsyncDatabase

from app.models.refresh_token import UserClaims, UserRefreshToken
from app.platform.auth.hashing import decrypt_secret, encrypt_secret, hash_refresh_token
from app.platform.auth.refresh_tokens import (
    REPLAY_GRACE_WINDOW,
    ConsumedToken,
    RefreshTokenExpiredError,
    RefreshTokenNotFoundError,
    RefreshTokenPendingError,
    RefreshTokenReplayedError,
    RefreshTokenReusedError,
    RefreshTokenRevokedError,
    TokenPair,
    _as_utc,
)
from app.repositories.base_repository import BaseRepository


class UserRefreshTokenRepository(BaseRepository):
    COLLECTION = "userRefreshTokens"
    REPLAY_CACHE_COLLECTION = "userRefreshTokenReplays"
    LOGOUT_MARKER_COLLECTION = "userRefreshTokenLogoutMarkers"
    # Poll briefly for a concurrent request's replay-cache entry before treating it as reuse.
    _REPLAY_CACHE_POLL_ATTEMPTS = 10
    _REPLAY_CACHE_POLL_INTERVAL_SECONDS = 0.05

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]
        self._replay_col = db[self.REPLAY_CACHE_COLLECTION]
        self._logout_marker_col = db[self.LOGOUT_MARKER_COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        col = db[cls.COLLECTION]
        await col.create_index("token_id", unique=True)
        await col.create_index("owner_id")
        await col.create_index("expires_at", expireAfterSeconds=0)
        replay_col = db[cls.REPLAY_CACHE_COLLECTION]
        await replay_col.create_index(
            "created_at", expireAfterSeconds=int(REPLAY_GRACE_WINDOW.total_seconds()) + 30
        )
        logout_marker_col = db[cls.LOGOUT_MARKER_COLLECTION]
        await logout_marker_col.create_index("owner_id", unique=True)

    @staticmethod
    def _to_consumed(doc: dict) -> ConsumedToken[UserClaims]:
        token = UserRefreshToken.from_mongo(doc)
        return ConsumedToken(
            owner_id=token.owner_id,
            claims=cast(UserClaims, token.claims.model_dump()),
            family_expires_at=_as_utc(token.family_expires_at),
        )

    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        claims: UserClaims,
        expires_at: datetime,
        family_expires_at: datetime,
        created_at: datetime,
    ) -> None:
        await self._col.insert_one(
            {
                "token_id": hash_refresh_token(token_id),
                "owner_id": owner_id,
                "claims": claims,
                "expires_at": expires_at,
                "family_expires_at": family_expires_at,
                "revoked": False,
                "revoked_reason": None,
                "consumed_at": None,
                "replaced_by": None,
                "created_at": created_at,
            }
        )

    async def try_consume(
        self, token_id: str, *, for_logout: bool = False
    ) -> ConsumedToken[UserClaims]:
        hashed = hash_refresh_token(token_id)
        now = datetime.now(tz=UTC)
        update: dict = {"revoked": True, "revoked_reason": "consumed", "consumed_at": now}
        if for_logout:
            update["logout_pending"] = True
        doc = await self._col.find_one_and_update(
            {"token_id": hashed, "revoked": False, "expires_at": {"$gt": now}},
            {"$set": update},
        )
        if doc is not None:
            return self._to_consumed(doc)

        existing = await self._col.find_one({"token_id": hashed})
        if existing is None:
            raise RefreshTokenNotFoundError
        if not existing["revoked"]:
            raise RefreshTokenExpiredError
        if existing.get("revoked_reason") == "logout":
            raise RefreshTokenRevokedError(existing["owner_id"])
        if existing.get("logout_pending"):
            raise RefreshTokenPendingError(existing["owner_id"])
        if existing.get("revoked_reason") == "consumed":
            consumed_at = existing.get("consumed_at")
            if consumed_at is not None and now - _as_utc(consumed_at) <= REPLAY_GRACE_WINDOW:
                for attempt in range(self._REPLAY_CACHE_POLL_ATTEMPTS):
                    cached = await self._replay_col.find_one({"_id": hashed})
                    if cached is not None and "pair" in cached:
                        raise RefreshTokenReplayedError(
                            existing["owner_id"], self._decrypt_pair(cached["pair"])
                        )
                    if attempt < self._REPLAY_CACHE_POLL_ATTEMPTS - 1:
                        await asyncio.sleep(self._REPLAY_CACHE_POLL_INTERVAL_SECONDS)
                raise RefreshTokenPendingError(existing["owner_id"])
        raise RefreshTokenReusedError(existing["owner_id"])

    async def cache_replay(self, token_id: str, pair: TokenPair) -> None:
        hashed = hash_refresh_token(token_id)
        await self._col.update_one(
            {"token_id": hashed},
            {"$set": {"replaced_by": hash_refresh_token(pair["refresh_token"])}},
        )
        await self._replay_col.update_one(
            {"_id": hashed},
            {"$set": {"pair": self._encrypt_pair(pair), "created_at": datetime.now(tz=UTC)}},
            upsert=True,
        )

    @staticmethod
    def _encrypt_pair(pair: TokenPair) -> dict:
        encrypted: dict = dict(pair)
        encrypted["access_token"] = encrypt_secret(pair["access_token"])
        encrypted["refresh_token"] = encrypt_secret(pair["refresh_token"])
        return encrypted

    @staticmethod
    def _decrypt_pair(stored: dict) -> TokenPair:
        pair = dict(stored)
        pair["access_token"] = decrypt_secret(stored["access_token"])
        pair["refresh_token"] = decrypt_secret(stored["refresh_token"])
        return cast(TokenPair, pair)

    async def revoke_all_for_owner(
        self, owner_id: str, *, reason: str, include_token_id: str | None = None
    ) -> None:
        owner_filter = {"owner_id": owner_id, "revoked": False}
        if include_token_id is None:
            query = owner_filter
        else:
            hashed = hash_refresh_token(include_token_id)
            query = {"$or": [owner_filter, {"token_id": hashed}]}
        await self._col.update_many(
            query, {"$set": {"revoked": True, "revoked_reason": reason}}
        )
        if reason == "logout":
            await self._logout_marker_col.update_one(
                {"owner_id": owner_id},
                {"$set": {"logged_out_at": datetime.now(tz=UTC)}},
                upsert=True,
            )

    async def logged_out_since(self, owner_id: str, since: datetime) -> bool:
        doc = await self._logout_marker_col.find_one({"owner_id": owner_id})
        if doc is None:
            return False
        return _as_utc(doc["logged_out_at"]) >= since - timedelta(milliseconds=1)
