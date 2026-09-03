from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository


class TranslationAuditRepository(BaseRepository):
    COLLECTION = "translationAudit"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        col = db[cls.COLLECTION]
        await col.create_index([("site_id", 1), ("route", 1), ("key", 1), ("at", -1)])
        await col.create_index([("site_id", 1), ("at", -1)])

    async def record(
        self,
        site_id: str,
        route: str,
        key: str,
        action: str,
        actor: str,
        lang: str | None = None,
        provider: str | None = None,
        detail: str = "",
        at: datetime | None = None,
    ) -> None:
        await self._col.insert_one(
            {
                "site_id": site_id,
                "route": route,
                "key": key,
                "lang": lang,
                "action": action,
                "actor": actor,
                "provider": provider,
                "detail": detail,
                "at": at or datetime.now(UTC),
            }
        )

    async def find_by_item(self, site_id: str, route: str, key: str) -> list[dict[str, Any]]:
        return (
            await self._col.find({"site_id": site_id, "route": route, "key": key})
            .sort([("at", -1), ("_id", -1)])
            .to_list(length=None)
        )

    async def find_by_site(
        self,
        site_id: str,
        route: str | None = None,
        action: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        query: dict[str, Any] = {"site_id": site_id}
        if route:
            query["route"] = route
        if action:
            query["action"] = action
        return await self._col.find(query).sort([("at", -1), ("_id", -1)]).to_list(length=limit)
