"""Translation repository — PyMongo async data access for the translations collection.

Document schema is designed so later phases (human review, translation memory,
glossary, quality scoring, versioning) are additive field writes, not migrations.
Phase A only reads/writes the fields marked "Phase A" below.

Schema:
    _id, siteId, route, key, sourceLang, sourceText,
    translations: { <lang>: { text, provider, createdAt } },   # Phase A
    status, approvedBy, approvedAt, reviewedAt, version,        # future — human review phase
    qualityScore, glossaryApplied, translationMemoryHit,        # future — AI/TM phase
    createdAt, updatedAt
"""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository


class TranslationRepository(BaseRepository):
    COLLECTION = "translations"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        """Unique (siteId, route, key) so concurrent extraction upserts can't race into duplicates."""
        await db[cls.COLLECTION].create_index([("siteId", 1), ("route", 1), ("key", 1)], unique=True)

    async def upsert_source(
        self,
        site_id: str,
        route: str,
        key: str,
        source_lang: str,
        text: str,
    ) -> None:
        """Insert the source document for (site, route, key) if it doesn't already exist.

        Never overwrites sourceText on an existing document — extraction may
        re-run on the same DOM many times.
        """
        now = datetime.now(UTC)
        await self._col.update_one(
            {"siteId": site_id, "route": route, "key": key},
            {
                "$setOnInsert": {
                    "siteId": site_id,
                    "route": route,
                    "key": key,
                    "sourceLang": source_lang,
                    "sourceText": text,
                    "translations": {},
                    "createdAt": now,
                    "updatedAt": now,
                }
            },
            upsert=True,
        )

    async def find_by_route(self, site_id: str, route: str) -> list[dict[str, Any]]:
        return await self._col.find({"siteId": site_id, "route": route}).to_list(length=None)

    async def find_by_keys(self, site_id: str, keys: list[str]) -> list[dict[str, Any]]:
        return await self._col.find({"siteId": site_id, "key": {"$in": keys}}).to_list(length=None)

    async def find_by_site(self, site_id: str, status: str | None = None) -> list[dict[str, Any]]:
        """Site-wide lookup for reviewer/admin workflows (e.g. a future Pending Queue).

        Kept as a plain status filter, no pagination, matching the other
        finder methods in this repository — a later phase can add
        skip/limit here without changing the query shape.
        """
        query: dict[str, Any] = {"siteId": site_id}
        if status:
            query["status"] = status
        return await self._col.find(query).to_list(length=None)

    async def save_translation(
        self,
        site_id: str,
        route: str,
        key: str,
        lang: str,
        text: str,
        provider: str,
        quality_score: float | None = None,
        created_by: str = "system",
    ) -> None:
        """Persist a translation.

        quality_score reflects trust in the *origin*, not a fabricated AI
        confidence number: 1.0 for Translation Memory reuse (already
        human-approved elsewhere) or a human-approved edit, None for a fresh
        AI translation pending review. See approve_translation() for how it's
        upgraded to 1.0 once a human approves the document.

        Matched by (site_id, route, key) — key alone is a content hash and
        collides across routes that share identical source text (e.g. "Login"
        on both "/" and "/register"), which would otherwise let one route's
        save silently overwrite another route's document.
        """
        now = datetime.now(UTC)
        await self._col.update_one(
            {"siteId": site_id, "route": route, "key": key},
            {
                "$set": {
                    f"translations.{lang}": {
                        "text": text,
                        "provider": provider,
                        "qualityScore": quality_score,
                        "createdBy": created_by,
                        "createdAt": now,
                    },
                    "updatedAt": now,
                }
            },
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
                    "updatedAt": now,
                }
            },
        )

    async def get_analytics(self, site_id: str | None = None) -> dict[str, int]:
        """Basic counts derived entirely from existing fields — no new schema.

        aiGenerated / translationMemoryReused count a document once if any of
        its translations originated from that source (a document can have
        both, e.g. one language from AI and another reused from TM).
        """
        match: dict[str, Any] = {"siteId": site_id} if site_id else {}

        total = await self._col.count_documents(match)
        approved = await self._col.count_documents({**match, "status": "approved"})

        ai_generated = 0
        tm_reused = 0
        docs = await self._col.find(match).to_list(length=None)
        for doc in docs:
            providers = {t.get("provider") for t in (doc.get("translations") or {}).values()}
            if providers - {"TranslationMemory"}:
                ai_generated += 1
            if "TranslationMemory" in providers:
                tm_reused += 1

        return {
            "totalTranslations": total,
            "approvedTranslations": approved,
            "pendingTranslations": total - approved,
            "aiGeneratedTranslations": ai_generated,
            "translationMemoryReusedTranslations": tm_reused,
        }

    async def find_exact_match(
        self, source_text: str, source_lang: str, target_lang: str
    ) -> dict[str, Any] | None:
        """Find an approved translation for identical source text (Translation Memory).

        Only approved documents are eligible — drafts/unreviewed AI output must
        not leak into TM reuse.
        """
        return await self._col.find_one(
            {
                "sourceText": source_text,
                "sourceLang": source_lang,
                "status": "approved",
                f"translations.{target_lang}": {"$exists": True},
            }
        )

    async def reject_translation(self, translation_id: str, rejected_by: str, reason: str) -> None:
        """Reject the document, returning it to draft so the reviewer can re-edit and re-submit.

        Distinct from approve_translation: rejection is not versioned (no
        version snapshot for content that was never approved) but IS recorded
        in the audit log via append_audit_entry, matching AC8 (audit trail
        for reviewer decisions, not just approvals).
        """
        now = datetime.now(UTC)
        await self._col.update_one(
            {"_id": self._to_id(translation_id)},
            {
                "$set": {
                    "status": "rejected",
                    "rejectedBy": rejected_by,
                    "rejectedAt": now,
                    "rejectionReason": reason,
                    "updatedAt": now,
                }
            },
        )

    async def append_audit_entry(self, translation_id: str, action: str, actor: str, detail: str = "") -> None:
        """Append an immutable audit entry (edited/approved/rejected) to the document.

        Separate from translation_versions (which only snapshots approved
        content) — this covers every reviewer action, satisfying AC8's
        broader "audit trail" requirement.
        """
        await self._col.update_one(
            {"_id": self._to_id(translation_id)},
            {
                "$push": {
                    "auditLog": {
                        "action": action,
                        "actor": actor,
                        "detail": detail,
                        "at": datetime.now(UTC),
                    }
                }
            },
        )

    async def approve_translation(self, translation_id: str, approved_by: str, version: int) -> None:
        """Approve the document, upgrade every language's qualityScore to 1.0, and record *version*.

        A human has now reviewed the document, so all translations on it are
        as trustworthy as a Translation Memory match — regardless of whether
        they originated from AI (qualityScore was None) or TM (already 1.0).
        The version snapshot itself is written by the caller (see
        TranslationService.approve_translation) into the append-only
        translation_versions collection before this method runs.
        """
        now = datetime.now(UTC)
        doc = await self._col.find_one({"_id": self._to_id(translation_id)})
        translations = (doc or {}).get("translations") or {}

        set_fields: dict[str, Any] = {
            "status": "approved",
            "approvedBy": approved_by,
            "approvedAt": now,
            "version": version,
            "updatedAt": now,
        }
        for lang in translations:
            set_fields[f"translations.{lang}.qualityScore"] = 1.0

        await self._col.update_one({"_id": self._to_id(translation_id)}, {"$set": set_fields})
