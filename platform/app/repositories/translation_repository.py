from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository

logger = logging.getLogger(__name__)

MAX_TRANSLATION_ROWS = 20_000


class TranslationRepository(BaseRepository):
    COLLECTION = "translations"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        await db[cls.COLLECTION].create_index([("site_id", 1), ("route", 1), ("key", 1)], unique=True)

    async def upsert_source(
        self,
        site_id: str,
        route: str,
        key: str,
        source_lang: str,
        text: str,
    ) -> None:
        now = datetime.now(UTC)
        await self._col.update_one(
            {"site_id": site_id, "route": route, "key": key},
            {
                "$setOnInsert": {
                    "site_id": site_id,
                    "route": route,
                    "key": key,
                    "source_lang": source_lang,
                    "source_text": text,
                    "translations": {},
                    "created_at": now,
                    "updated_at": now,
                }
            },
            upsert=True,
        )

    async def find_by_route(self, site_id: str, route: str) -> list[dict[str, Any]]:
        return await self._col.find({"site_id": site_id, "route": route}).to_list(length=None)

    async def find_by_keys(self, site_id: str, keys: list[str]) -> list[dict[str, Any]]:
        return await self._col.find({"site_id": site_id, "key": {"$in": keys}}).to_list(length=None)

    async def find_by_site(self, site_id: str, status: str | None = None) -> list[dict[str, Any]]:
        query: dict[str, Any] = {"site_id": site_id}
        if status:
            query["status"] = status
        docs = await self._col.find(query).limit(MAX_TRANSLATION_ROWS).to_list(length=MAX_TRANSLATION_ROWS)
        if len(docs) == MAX_TRANSLATION_ROWS:
            logger.warning("find_by_site hit MAX_TRANSLATION_ROWS cap", extra={"site_id": site_id})
        return docs

    async def save_translation(
        self,
        site_id: str,
        route: str,
        key: str,
        lang: str,
        text: str,
        provider: str,
        quality_score: float = 1.0,
        created_by: str = "system",
        auto_approved: bool = False,
    ) -> None:
        now = datetime.now(UTC)
        set_fields: dict[str, Any] = {
            f"translations.{lang}": {
                "text": text,
                "provider": provider,
                "quality_score": quality_score,
                "created_by": created_by,
                "created_at": now,
                "status": "approved" if auto_approved else "pending",
            },
            "updated_at": now,
        }
        if auto_approved:
            set_fields["status"] = "approved"
            set_fields["approved_by"] = "system:TranslationMemory"
            set_fields["approved_at"] = now
        await self._col.update_one(
            {"site_id": site_id, "route": route, "key": key},
            {"$set": set_fields},
        )

    async def find_by_id(self, translation_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"_id": self._to_id(translation_id)})

    async def update_translation_text(self, translation_id: str, lang: str, text: str) -> None:
        now = datetime.now(UTC)
        await self._col.update_one(
            {"_id": self._to_id(translation_id)},
            {
                "$set": {
                    f"translations.{lang}.text": text,
                    "updated_at": now,
                }
            },
        )

    async def get_analytics(self, site_id: str | None = None) -> dict[str, int]:
        match: dict[str, Any] = {"site_id": site_id} if site_id else {}

        total = await self._col.count_documents(match)
        approved = await self._col.count_documents({**match, "status": "approved"})

        ai_generated = 0
        tm_reused = 0
        docs = await self._col.find(match).limit(MAX_TRANSLATION_ROWS).to_list(length=MAX_TRANSLATION_ROWS)
        if len(docs) == MAX_TRANSLATION_ROWS:
            logger.warning("get_analytics hit MAX_TRANSLATION_ROWS cap", extra={"site_id": site_id})
        for doc in docs:
            providers = {t.get("provider") for t in (doc.get("translations") or {}).values()}
            if providers - {"TranslationMemory"}:
                ai_generated += 1
            if "TranslationMemory" in providers:
                tm_reused += 1

        return {
            "total_translations": total,
            "approved_translations": approved,
            "pending_translations": total - approved,
            "ai_generated_translations": ai_generated,
            "translation_memory_reused_translations": tm_reused,
        }

    async def find_exact_match(
        self, site_id: str, source_text: str, source_lang: str, target_lang: str
    ) -> dict[str, Any] | None:
        return await self._col.find_one(
            {
                "site_id": site_id,
                "source_text": source_text,
                "source_lang": source_lang,
                f"translations.{target_lang}.status": "approved",
            }
        )

    async def reject_translation(self, translation_id: str, lang: str, rejected_by: str, reason: str) -> None:
        now = datetime.now(UTC)
        await self._col.update_one(
            {"_id": self._to_id(translation_id)},
            {
                "$set": {
                    f"translations.{lang}.status": "rejected",
                    f"translations.{lang}.rejected_by": rejected_by,
                    f"translations.{lang}.rejected_at": now,
                    f"translations.{lang}.rejection_reason": reason,
                    "status": "rejected",
                    "rejected_by": rejected_by,
                    "rejected_at": now,
                    "rejection_reason": reason,
                    "updated_at": now,
                }
            },
        )

    async def append_audit_entry(self, translation_id: str, action: str, actor: str, detail: str = "") -> None:
        await self._col.update_one(
            {"_id": self._to_id(translation_id)},
            {
                "$push": {
                    "audit_log": {
                        "action": action,
                        "actor": actor,
                        "detail": detail,
                        "at": datetime.now(UTC),
                    }
                }
            },
        )

    async def approve_translation(self, translation_id: str, lang: str, approved_by: str, version: int) -> None:
        now = datetime.now(UTC)
        set_fields: dict[str, Any] = {
            f"translations.{lang}.status": "approved",
            f"translations.{lang}.approved_by": approved_by,
            f"translations.{lang}.approved_at": now,
            f"translations.{lang}.quality_score": 1.0,
            "status": "approved",
            "approved_by": approved_by,
            "approved_at": now,
            "version": version,
            "updated_at": now,
        }

        await self._col.update_one({"_id": self._to_id(translation_id)}, {"$set": set_fields})
