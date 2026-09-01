"""Translation service — business logic for AI-powered site translation.

Depends only on the TranslationProvider abstraction, never a concrete vendor
class, so swapping AI vendors is a settings change, not a service rewrite.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.platform.settings import get_settings
from app.providers.translation_provider import (
    TransientTranslationError,
    TranslationProvider,
    get_translation_provider,
)
from app.repositories.glossary_repository import GlossaryRepository
from app.repositories.translation_audit_repository import TranslationAuditRepository
from app.repositories.translation_repository import TranslationRepository
from app.repositories.translation_version_repository import TranslationVersionRepository
from app.services.glossary_normalizer import GlossaryNormalizer
from app.services.placeholder_protector import mask, unmask
from app.services.quality_scorer import is_low_confidence, score_translation

logger = logging.getLogger(__name__)


class TranslationService:
    def __init__(self, db: AsyncDatabase[Any], provider: TranslationProvider) -> None:
        self._repo = TranslationRepository(db)
        self._provider = provider
        self._glossary_repo = GlossaryRepository(db)
        self._glossary = GlossaryNormalizer()
        self._version_repo = TranslationVersionRepository(db)
        self._audit_repo = TranslationAuditRepository(db)

    async def _audit(
        self,
        *,
        translation_id: str | None,
        site_id: str,
        route: str,
        key: str,
        action: str,
        actor: str,
        lang: str | None = None,
        provider: str | None = None,
        detail: str = "",
    ) -> None:
        """Record one immutable audit event in BOTH the per-document embedded
        auditLog (fast per-item view) and the append-only translation_audit
        collection (global "who did what, when" queries)."""
        if translation_id is not None:
            await self._repo.append_audit_entry(translation_id, action, actor, detail=detail)
        await self._audit_repo.record(
            site_id=site_id,
            route=route,
            key=key,
            action=action,
            actor=actor,
            lang=lang,
            provider=provider,
            detail=detail,
        )

    async def extract_items(self, site_id: str, items: list[dict[str, Any]]) -> None:
        """Upsert source text for each extracted DOM item.

        Never overwrites text already known for a (site, route, key) — the SDK
        re-sends the same items on every DOM mutation debounce.
        """
        for item in items:
            await self._repo.upsert_source(
                site_id=site_id,
                route=item["route"],
                key=item["key"],
                source_lang=item.get("sourceLang", "en"),
                text=item["text"],
            )

    async def get_stored_translations(self, site_id: str, route: str, lang: str) -> dict[str, str]:
        """Runtime read path for the SDK: return {key: text} using ONLY what is
        already stored — never call the AI provider inline.

        On-demand translation inside this request path is what made an
        uncovered route un-renderable: translating hundreds of missing items
        synchronously bursts the provider, hits its rate/quota limit, retries
        with backoff, and the request eventually 502s — blocking the SDK from
        applying even the items that WERE already translated. Reading stored
        data only makes this endpoint fast and stall-free: every item that has
        a translation for *lang* renders immediately; items still missing fall
        back to their source text (never null). Generating the missing ones is
        an offline/background backfill job, not this read-only request path.
        """
        docs = await self._repo.find_by_route(site_id, route)
        result: dict[str, str] = {}
        for doc in docs:
            existing = (doc.get("translations") or {}).get(lang)
            result[doc["key"]] = existing["text"] if existing else doc["sourceText"]
        return result

    # Batch limits for on-demand runtime translation (Azure /translate accepts an
    # array; keep each request under its item + character caps).
    _RUNTIME_BATCH_ITEMS = 50
    _RUNTIME_BATCH_CHARS = 45_000

    async def _persist_translation(
        self, site_id: str, route: str, doc: dict[str, Any], lang: str,
        translated: str, provider_name: str, quality_score: float | None,
    ) -> None:
        actor = f"system:{provider_name}"
        await self._repo.save_translation(
            site_id=site_id, route=route, key=doc["key"], lang=lang,
            text=translated, provider=provider_name, quality_score=quality_score, created_by=actor,
        )
        await self._audit(
            translation_id=str(doc["_id"]), site_id=site_id, route=route, key=doc["key"],
            action="translated", actor=actor, lang=lang, provider=provider_name,
        )

    async def runtime_translate(self, site_id: str, route: str, lang: str) -> dict[str, str]:
        """On-demand runtime path for the SDK: return {key: text} for every item on
        *route*, generating any missing *lang* translations inline via the provider.

        This is what lets the SDK translate ANY freshly-injected website into ANY
        selected language: extracted items that have no translation yet are run
        through glossary -> Translation Memory -> AI (batched) and stored, so the
        first switch to a language translates the page and later loads are instant.

        Batching + a fast MT provider (Azure: no LLM token/day cap) keep this from
        stalling. If generation transiently fails for an item, that item falls back
        to its source text (never null, never a persisted placeholder), and retries
        on a later request.
        """
        docs = await self._repo.find_by_route(site_id, route)
        result: dict[str, str] = {}
        glossary_cache: dict[str, list[dict[str, Any]]] = {}
        pending: list[tuple[dict[str, Any], str, dict[str, str], str, str]] = []

        for doc in docs:
            existing = (doc.get("translations") or {}).get(lang)
            if existing:
                result[doc["key"]] = existing["text"]
                continue

            source_lang = doc.get("sourceLang", "en")
            if lang not in glossary_cache:
                glossary_cache[lang] = await self._glossary_repo.find_by_lang(lang)
            normalized = self._glossary.apply(doc["sourceText"], glossary_cache[lang])

            tm_hit = await self._repo.find_exact_match(doc["sourceText"], source_lang, lang)
            if tm_hit:
                translated = tm_hit["translations"][lang]["text"]
                await self._persist_translation(site_id, route, doc, lang, translated, "TranslationMemory", 1.0)
                result[doc["key"]] = translated
                continue

            masked, pmap = mask(normalized)
            pending.append((doc, masked, pmap, source_lang, normalized))

        await self._runtime_batch_ai(site_id, route, lang, pending, result)
        return result

    async def _runtime_batch_ai(self, site_id, route, lang, pending, result) -> None:
        """Translate all *pending* items via the provider's batch endpoint, grouped
        by source language and chunked under the batch item/char caps. Store each
        result; on transient failure retry per-item, then fall back to source."""
        by_src: dict[str, list] = {}
        for entry in pending:
            by_src.setdefault(entry[3], []).append(entry)

        for source_lang, entries in by_src.items():
            for chunk in self._chunk(entries):
                masked_texts = [m for (_d, m, _p, _s, _n) in chunk]
                try:
                    outs = await self._provider.translate_batch(masked_texts, source_lang, lang)
                    for (doc, _m, pmap, _s, normalized), out in zip(chunk, outs):
                        translated = unmask(out, pmap)
                        quality = score_translation(normalized, out, pmap)
                        await self._persist_translation(site_id, route, doc, lang, translated, type(self._provider).__name__, quality)
                        result[doc["key"]] = translated
                except (TransientTranslationError, RuntimeError):
                    for doc, masked, pmap, _s, normalized in chunk:
                        try:
                            out = await self._provider.translate(masked, source_lang, lang)
                        except (TransientTranslationError, RuntimeError):
                            result[doc["key"]] = doc["sourceText"]
                            continue
                        translated = unmask(out, pmap)
                        quality = score_translation(normalized, out, pmap)
                        await self._persist_translation(site_id, route, doc, lang, translated, type(self._provider).__name__, quality)
                        result[doc["key"]] = translated

    def _chunk(self, entries: list) -> list[list]:
        out: list[list] = []
        cur: list = []
        cur_chars = 0
        for e in entries:
            clen = len(e[1])
            if cur and (len(cur) >= self._RUNTIME_BATCH_ITEMS or cur_chars + clen > self._RUNTIME_BATCH_CHARS):
                out.append(cur)
                cur, cur_chars = [], 0
            cur.append(e)
            cur_chars += clen
        if cur:
            out.append(cur)
        return out

    async def get_or_translate(self, site_id: str, route: str, lang: str) -> dict[str, str]:
        """Return {key: text} for every known item on *route*, runtime-safe for the SDK.

        Missing translations for *lang* run source text through the pipeline:
        glossary normalization -> Translation Memory (approved exact match) ->
        AI provider, then persist. Existing translations are reused as-is and
        returned to the caller (runtime auto-approve: any available translation
        is served so newly-added pages render immediately without a manual
        review step).

        If the AI provider transiently fails for an item, that item is SKIPPED
        (its source text is returned) rather than persisting a fabricated
        placeholder — so a rate-limit blip never poisons the DB, and the item
        retries on a later request. The SDK therefore never receives null and
        never receives placeholder text like "[ta] ...".
        """
        docs = await self._repo.find_by_route(site_id, route)
        result: dict[str, str] = {}

        for doc in docs:
            existing = (doc.get("translations") or {}).get(lang)
            if existing:
                result[doc["key"]] = existing["text"]
                continue

            source_lang = doc.get("sourceLang", "en")
            glossary_terms = await self._glossary_repo.find_by_lang(lang)
            normalized_text = self._glossary.apply(doc["sourceText"], glossary_terms)

            tm_hit = await self._repo.find_exact_match(doc["sourceText"], source_lang, lang)
            if tm_hit:
                translated = tm_hit["translations"][lang]["text"]
                provider_name = "TranslationMemory"
                quality_score = 1.0  # already human-approved elsewhere
            else:
                masked_text, placeholder_map = mask(normalized_text)
                try:
                    masked_translated = await self._provider.translate(
                        text=masked_text,
                        source_lang=source_lang,
                        target_lang=lang,
                    )
                except TransientTranslationError:
                    # Leave untranslated; a later request retries. Never persist a placeholder.
                    result[doc["key"]] = doc["sourceText"]
                    continue
                translated = unmask(masked_translated, placeholder_map)
                provider_name = type(self._provider).__name__
                quality_score = score_translation(normalized_text, masked_translated, placeholder_map)

            actor = f"system:{provider_name}"
            await self._repo.save_translation(
                site_id=site_id,
                route=route,
                key=doc["key"],
                lang=lang,
                text=translated,
                provider=provider_name,
                quality_score=quality_score,
                created_by=actor,
            )
            await self._audit(
                translation_id=str(doc["_id"]),
                site_id=site_id,
                route=route,
                key=doc["key"],
                action="translated",
                actor=actor,
                lang=lang,
                provider=provider_name,
            )
            result[doc["key"]] = translated

        return result

    async def list_translations(
        self,
        site_id: str,
        route: str | None = None,
        status: str | None = None,
        low_confidence_only: bool = False,
    ) -> list[dict[str, Any]]:
        """List translation documents for reviewer/admin workflows.

        Route-scoped lookups (Phase 1's translationId bootstrap) reuse
        find_by_route directly. Site-wide lookups (future Pending Queue,
        route omitted) go through find_by_site instead — same status
        filter, no endpoint redesign needed when that phase lands.

        low_confidence_only filters to documents with at least one language
        whose heuristic qualityScore is below the low-confidence threshold —
        this is the reviewer-facing "needs attention" queue (AC6).
        """
        if route:
            docs = await self._repo.find_by_route(site_id, route)
            if status:
                docs = [doc for doc in docs if doc.get("status") == status]
        else:
            docs = await self._repo.find_by_site(site_id, status)

        if low_confidence_only:
            threshold = get_settings().low_confidence_threshold
            docs = [
                doc
                for doc in docs
                if any(
                    is_low_confidence(t.get("qualityScore"), threshold)
                    for t in (doc.get("translations") or {}).values()
                )
            ]
        return docs

    async def get_translation(self, translation_id: str) -> dict[str, Any]:
        doc = await self._repo.find_by_id(translation_id)
        if doc is None:
            raise NotFoundError("Translation", translation_id)
        return doc

    async def update_translation(
        self, translation_id: str, lang: str, text: str, editor: str = ""
    ) -> dict[str, Any]:
        doc = await self.get_translation(translation_id)  # raises NotFoundError if missing
        await self._repo.update_translation_text(translation_id, lang, text)
        await self._audit(
            translation_id=translation_id,
            site_id=doc["siteId"],
            route=doc["route"],
            key=doc["key"],
            action="edited",
            actor=editor,
            lang=lang,
            detail=f"lang={lang}",
        )
        return await self.get_translation(translation_id)

    async def approve_translation(self, translation_id: str, approved_by: str) -> dict[str, Any]:
        """Approve the document and append a version snapshot (never overwritten).

        Version numbering starts at 1. Only approved states are versioned —
        drafts and edits-in-progress never get a version entry.
        """
        doc = await self.get_translation(translation_id)  # raises NotFoundError if missing
        next_version = doc.get("version", 0) + 1
        approved_at = datetime.now(UTC)

        await self._version_repo.add_version(
            translation_id=translation_id,
            version=next_version,
            translations=doc.get("translations") or {},
            approved_by=approved_by,
            approved_at=approved_at,
        )
        await self._repo.approve_translation(translation_id, approved_by, version=next_version)
        await self._audit(
            translation_id=translation_id,
            site_id=doc["siteId"],
            route=doc["route"],
            key=doc["key"],
            action="approved",
            actor=approved_by,
            detail=f"version={next_version}",
        )
        return await self.get_translation(translation_id)

    async def reject_translation(self, translation_id: str, rejected_by: str, reason: str) -> dict[str, Any]:
        doc = await self.get_translation(translation_id)  # raises NotFoundError if missing
        await self._repo.reject_translation(translation_id, rejected_by, reason)
        await self._audit(
            translation_id=translation_id,
            site_id=doc["siteId"],
            route=doc["route"],
            key=doc["key"],
            action="rejected",
            actor=rejected_by,
            detail=reason,
        )
        return await self.get_translation(translation_id)

    async def get_audit_trail(
        self,
        site_id: str,
        route: str | None = None,
        key: str | None = None,
        action: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        """Return append-only audit events, newest first.

        Per-item (route+key) or site-wide (optionally filtered by action).
        """
        if route and key:
            return await self._audit_repo.find_by_item(site_id, route, key)
        return await self._audit_repo.find_by_site(site_id, route=route, action=action, limit=limit)

    async def get_version_history(self, translation_id: str) -> list[dict[str, Any]]:
        await self.get_translation(translation_id)  # raises NotFoundError if missing
        return await self._version_repo.find_by_translation(translation_id)


def get_translation_service(
    db: AsyncDatabase[Any] = Depends(get_db),
) -> TranslationService:
    provider = get_translation_provider(get_settings())
    return TranslationService(db, provider)
