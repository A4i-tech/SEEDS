from __future__ import annotations

import logging
from datetime import UTC, datetime

from pymongo.asynchronous.database import AsyncDatabase

from app.platform.auth.hashing import hash_refresh_token
from app.platform.auth.refresh_tokens import (
    ConsumedToken,
    RefreshTokenExpiredError,
    RefreshTokenInvalidError,
)
from app.platform.telemetry import get_counter
from app.repositories.base_repository import BaseRepository

logger = logging.getLogger(__name__)


class RefreshTokenRepository[ClaimsT](BaseRepository):
    COLLECTION: str
    REUSE_COUNTER: str

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        col = db[cls.COLLECTION]
        await col.create_index("token_id", unique=True)
        await col.create_index("owner_id")
        await col.create_index("expires_at", expireAfterSeconds=0)

    async def insert(
        self,
        *,
        token_id: str,
        owner_id: str,
        claims: ClaimsT,
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
                "revoked_reason": "",
                "created_at": created_at,
            }
        )

    async def try_consume(self, token_id: str) -> ConsumedToken[ClaimsT]:
        hashed = hash_refresh_token(token_id)
        doc = await self._col.find_one_and_update(
            {"token_id": hashed, "revoked": False, "expires_at": {"$gt": datetime.now(tz=UTC)}},
            {"$set": {"revoked": True, "revoked_reason": "consumed"}},
        )
        if doc is not None:
            return ConsumedToken(
                owner_id=doc["owner_id"],
                claims=doc["claims"],
                family_expires_at=doc["family_expires_at"].replace(tzinfo=UTC),
            )

        existing = await self._col.find_one({"token_id": hashed})
        if existing is None or existing["revoked_reason"] == "logout":
            raise RefreshTokenInvalidError
        if not existing["revoked"]:
            raise RefreshTokenExpiredError
        await self._revoke_on_reuse(existing["owner_id"])
        raise RefreshTokenInvalidError

    async def _revoke_on_reuse(self, owner_id: str) -> None:
        logger.warning(
            "refresh_tokens: revoked refresh token replayed — owner_id=%s",
            owner_id,
            extra={"event": "refresh_token_reuse_detected", "owner_id": owner_id},
        )
        get_counter(self.REUSE_COUNTER).add(1, {"owner_id": owner_id})
        await self.revoke_all_for_owner(owner_id, reason="consumed")

    async def revoke_session(self, token_id: str) -> None:
        existing = await self._col.find_one({"token_id": hash_refresh_token(token_id)})
        if not existing:
            logger.info("refresh_tokens: logout with unknown refresh token")
            return
        if existing["revoked_reason"] == "consumed":
            await self._revoke_on_reuse(existing["owner_id"])
            raise RefreshTokenInvalidError
        await self.revoke_all_for_owner(
            existing["owner_id"], reason="logout", include_token_id=token_id
        )

    async def revoke_all_for_owner(
        self, owner_id: str, *, reason: str, include_token_id: str = ""
    ) -> None:
        query: dict = {"owner_id": owner_id, "revoked": False}
        if include_token_id:
            query = {"$or": [query, {"token_id": hash_refresh_token(include_token_id)}]}
        await self._col.update_many(query, {"$set": {"revoked": True, "revoked_reason": reason}})
