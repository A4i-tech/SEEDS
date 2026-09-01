"""Translation audit repository — append-only trail for the translations pipeline.

Every state change to a translation (machine translation created, reviewer edit,
approval, rejection) is recorded here as an immutable event so the full history
of "who did what, when" is queryable across all translations — complementing the
per-document embedded ``auditLog`` (fast per-item view) and ``translation_versions``
(approved-content snapshots).

Schema:
    _id, siteId, route, key,
    lang,          # target language for item-level events (translated/edited); None for doc-level (approved/rejected)
    action,        # "translated" | "edited" | "approved" | "rejected"
    actor,         # human identity (reviewer email) or machine actor ("system:GroqTranslationProvider", "system:backfill")
    provider,      # AI/TM provider for machine translations, else None
    detail,        # free-form (e.g. rejection reason)
    at             # event timestamp (UTC)
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository


class TranslationAuditRepository(BaseRepository):
    COLLECTION = "translation_audit"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        col = db[cls.COLLECTION]
        # Per-item history lookups (audit for one translated phrase).
        await col.create_index([("siteId", 1), ("route", 1), ("key", 1), ("at", -1)])
        # Global, newest-first site audit feed.
        await col.create_index([("siteId", 1), ("at", -1)])

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
                "siteId": site_id,
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
        # Secondary sort on _id keeps ordering deterministic when two events share
        # the same timestamp (insertion order == chronological order).
        return (
            await self._col.find({"siteId": site_id, "route": route, "key": key})
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
        query: dict[str, Any] = {"siteId": site_id}
        if route:
            query["route"] = route
        if action:
            query["action"] = action
        return await self._col.find(query).sort([("at", -1), ("_id", -1)]).to_list(length=limit)
