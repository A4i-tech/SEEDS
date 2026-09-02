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

import logging
from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.base_repository import BaseRepository

logger = logging.getLogger(__name__)

# Defensive ceiling on site-wide reads (find_by_site, get_analytics). Not real
# pagination — a circuit breaker against an unbounded full-collection scan.
# Any realistic tenant's translation set stays far below this; hitting it is
# logged so it can be treated as a signal to add cursor pagination.
MAX_TRANSLATION_ROWS = 20_000


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
        docs = await self._col.find(query).limit(MAX_TRANSLATION_ROWS).to_list(length=MAX_TRANSLATION_ROWS)
        if len(docs) == MAX_TRANSLATION_ROWS:
            logger.warning("find_by_site hit MAX_TRANSLATION_ROWS cap", extra={"siteId": site_id})
        return docs

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
        auto_approved: bool = False,
    ) -> None:
        """Persist a translation.

        quality_score reflects trust in the *origin*, not a fabricated AI
        confidence number: 1.0 for Translation Memory reuse (already
        human-approved elsewhere) or a human-approved edit, None for a fresh
        AI translation pending review. See approve_translation() for how it's
        upgraded to 1.0 once a human approves *that language*.

        Matched by (site_id, route, key) — key alone is a content hash and
        collides across routes that share identical source text (e.g. "Login"
        on both "/" and "/register"), which would otherwise let one route's
        save silently overwrite another route's document.

        Approval state is per-language (translations.{lang}.status), never
        inherited from any other language already on the document — a newly
        (re)generated language always starts "pending" here, even if another
        language on the same document is already approved. auto_approved is
        used only for Translation Memory reuse, which is by construction
        reusing content a human already approved elsewhere for *this*
        language (find_exact_match only matches a translation approved for
        the requested target_lang), so it's safe to mark that one language
        approved at persist time without a redundant manual review step.
        """
        now = datetime.now(UTC)
        set_fields: dict[str, Any] = {
            f"translations.{lang}": {
                "text": text,
                "provider": provider,
                "qualityScore": quality_score,
                "createdBy": created_by,
                "createdAt": now,
                "status": "approved" if auto_approved else "pending",
            },
            "updatedAt": now,
        }
        if auto_approved:
            # Legacy/analytics convenience only (get_analytics, list_translations
            # status filter) -- never read for runtime serving or TM-reuse, both
            # of which key off translations.{lang}.status exclusively.
            set_fields["status"] = "approved"
            set_fields["approvedBy"] = "system:TranslationMemory"
            set_fields["approvedAt"] = now
        await self._col.update_one(
            {"siteId": site_id, "route": route, "key": key},
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
        docs = await self._col.find(match).limit(MAX_TRANSLATION_ROWS).to_list(length=MAX_TRANSLATION_ROWS)
        if len(docs) == MAX_TRANSLATION_ROWS:
            logger.warning("get_analytics hit MAX_TRANSLATION_ROWS cap", extra={"siteId": site_id})
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
        self, site_id: str, source_text: str, source_lang: str, target_lang: str
    ) -> dict[str, Any] | None:
        """Find a translation for identical source text within the same site, approved
        specifically for *target_lang* (Translation Memory).

        Matching on translations.{target_lang}.status (not any document-level
        status) so approving one language on a document never makes another,
        still-pending language on it eligible for TM reuse. Scoped to siteId
        so one tenant's approved translation is never reused to auto-approve
        another tenant's document.
        """
        return await self._col.find_one(
            {
                "siteId": site_id,
                "sourceText": source_text,
                "sourceLang": source_lang,
                f"translations.{target_lang}.status": "approved",
            }
        )

    async def reject_translation(self, translation_id: str, lang: str, rejected_by: str, reason: str) -> None:
        """Reject *lang* on the document, returning it to draft so the reviewer can re-edit and re-submit.

        Scoped to translations.{lang} only — rejecting one language must never
        change the approval status of any other language already on the same
        document. Distinct from approve_translation: rejection is not
        versioned (no version snapshot for content that was never approved)
        but IS recorded in the audit log via append_audit_entry, matching AC8
        (audit trail for reviewer decisions, not just approvals).

        Document-level status/rejectedBy/rejectedAt/rejectionReason are also
        recorded as a best-effort "most recent reviewer action" convenience
        for analytics/listing (get_analytics, list_translations status
        filter) — they are never read for runtime serving or TM-reuse
        decisions, only translations.{lang}.status is.
        """
        now = datetime.now(UTC)
        await self._col.update_one(
            {"_id": self._to_id(translation_id)},
            {
                "$set": {
                    f"translations.{lang}.status": "rejected",
                    f"translations.{lang}.rejectedBy": rejected_by,
                    f"translations.{lang}.rejectedAt": now,
                    f"translations.{lang}.rejectionReason": reason,
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

    async def approve_translation(self, translation_id: str, lang: str, approved_by: str, version: int) -> None:
        """Approve *lang* on the document, upgrade only that language's qualityScore to
        1.0, and record *version*.

        A human has now reviewed *this language*, so it is as trustworthy as
        a Translation Memory match — regardless of whether it originated from
        AI (qualityScore was None) or TM (already 1.0). Scoped to
        translations.{lang} only: approving Kannada must never approve, or
        touch the qualityScore of, Malayalam on the same document. The
        version snapshot itself is written by the caller (see
        TranslationService.approve_translation) into the append-only
        translation_versions collection before this method runs.

        Document-level status/approvedBy/approvedAt/version are also recorded
        as a best-effort "most recent reviewer action" convenience for
        analytics/listing (get_analytics, list_translations status filter) —
        they are never read for runtime serving or TM-reuse decisions, only
        translations.{lang}.status is.
        """
        now = datetime.now(UTC)
        set_fields: dict[str, Any] = {
            f"translations.{lang}.status": "approved",
            f"translations.{lang}.approvedBy": approved_by,
            f"translations.{lang}.approvedAt": now,
            f"translations.{lang}.qualityScore": 1.0,
            "status": "approved",
            "approvedBy": approved_by,
            "approvedAt": now,
            "version": version,
            "updatedAt": now,
        }

        await self._col.update_one({"_id": self._to_id(translation_id)}, {"$set": set_fields})
