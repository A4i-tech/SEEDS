"""Translation service — business logic for AI-powered site translation.

Depends only on the TranslationProvider abstraction, never a concrete vendor
class, so swapping AI vendors is a settings change, not a service rewrite.
"""

from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urlparse

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.platform.auth.dependencies import get_db
from app.platform.error_handling import ForbiddenError, NotFoundError, ValidationError
from app.platform.settings import get_settings
from app.providers.translation_provider import (
    TransientTranslationError,
    TranslationProvider,
    get_translation_provider,
)
from app.repositories.glossary_repository import GlossaryRepository
from app.repositories.language_repository import LanguageRepository
from app.repositories.translation_audit_repository import TranslationAuditRepository
from app.repositories.translation_repository import TranslationRepository
from app.repositories.translation_version_repository import TranslationVersionRepository
from app.repositories.website_repository import WebsiteRepository
from app.services.glossary_normalizer import GlossaryNormalizer
from app.services.placeholder_protector import mask, unmask
from app.services.quality_scorer import is_low_confidence, score_translation

logger = logging.getLogger(__name__)


class TranslationService:
    def __init__(
        self,
        db: AsyncDatabase[Any],
        provider_factory: Callable[[], TranslationProvider],
        enforce_origin_check: bool = True,
        enforce_lang_validation: bool = True,
    ) -> None:
        self._repo = TranslationRepository(db)
        self._provider_factory = provider_factory
        self._provider_instance: TranslationProvider | None = None
        self._glossary_repo = GlossaryRepository(db)
        self._glossary = GlossaryNormalizer()
        self._version_repo = TranslationVersionRepository(db)
        self._audit_repo = TranslationAuditRepository(db)
        self._website_repo = WebsiteRepository(db)
        self._language_repo = LanguageRepository(db)
        # Always on for the real DI-constructed service (see get_translation_service
        # below). Unit tests that don't care about the abuse-prevention checks
        # under test disable these explicitly rather than seeding a domain/
        # language fixture for every unrelated call.
        self._enforce_origin_check = enforce_origin_check
        self._enforce_lang_validation = enforce_lang_validation

    @property
    def _provider(self) -> TranslationProvider:
        if self._provider_instance is None:
            self._provider_instance = self._provider_factory()
        return self._provider_instance

    async def _ensure_site_active(self, site_id: str) -> dict[str, Any]:
        """Reject any siteId that isn't a registered, active website.

        Called from the two unauthenticated public endpoints (/extract, GET
        /translations) so an arbitrary string can't write source text or
        trigger paid inline AI translation under a made-up tenant. Returns
        the website doc so callers can bind the request to its registered
        domain.
        """
        website = await self._website_repo.find_by_site_id(site_id)
        if not website or website.get("status") != "Active":
            raise NotFoundError("website", site_id)
        return website

    @staticmethod
    def _hostname_of(header_value: str | None) -> str | None:
        if not header_value:
            return None
        return urlparse(header_value).hostname

    _DEV_LOCALHOST_ALIASES = {"localhost", "127.0.0.1"}

    @staticmethod
    def _strip_www(host: str | None) -> str | None:
        if host and host.startswith("www."):
            return host[4:]
        return host

    def _ensure_origin_matches(
        self, website: dict[str, Any], origin: str | None, referer: str | None
    ) -> None:
        """Bind a public siteId call to the domain it was registered with.

        siteId is public by construction (it ships in the embed snippet on
        the customer's page), so knowing siteId alone doesn't prove the
        caller has anything to do with that site. Require the Origin (or,
        failing that, Referer) header's hostname to match the site's
        registered domain — the same binding Weglot/Localize use for public
        site keys. The comparison strips a single leading "www." from both
        sides so example.com and www.example.com are treated as the same
        site (extremely common dual-host deployment) — this is a narrow
        alias, not general subdomain/suffix matching: api.example.com still
        never matches example.com.
        """
        if not self._enforce_origin_check:
            return
        hostname = self._hostname_of(origin) or self._hostname_of(referer)
        domain = website.get("domain")
        if hostname == domain or self._strip_www(hostname) == self._strip_www(domain):
            return
        if (
            get_settings().enable_dev_localhost_origin_alias
            and hostname in self._DEV_LOCALHOST_ALIASES
            and domain in self._DEV_LOCALHOST_ALIASES
        ):
            return
        raise ForbiddenError("origin does not match registered site domain")

    async def _ensure_lang_enabled(self, lang: str) -> None:
        if not self._enforce_lang_validation:
            return
        languages = await self._language_repo.find_all(enabled_only=True)
        codes = {language["code"] for language in languages}
        if lang not in codes:
            raise ValidationError(f"lang {lang!r} is not an enabled language")

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

    async def extract_items(
        self,
        site_id: str,
        items: list[dict[str, Any]],
        origin: str | None = None,
        referer: str | None = None,
    ) -> None:
        """Upsert source text for each extracted DOM item.

        Never overwrites text already known for a (site, route, key) — the SDK
        re-sends the same items on every DOM mutation debounce.
        """
        website = await self._ensure_site_active(site_id)
        self._ensure_origin_matches(website, origin, referer)
        for item in items:
            await self._repo.upsert_source(
                site_id=site_id,
                route=item["route"],
                key=item["key"],
                source_lang=item.get("sourceLang", "en"),
                text=item["text"],
            )

    async def extract_items_for_review(self, site_id: str, items: list[dict[str, Any]]) -> None:
        """Authenticated equivalent of extract_items for the admin website-translate flow.

        Same upsert-source behavior, but never calls _ensure_origin_matches —
        authentication (_require_content_write on the calling route) replaces
        origin binding for this internal path, same precedent as
        generate_for_review. The public POST /translations/extract endpoint
        keeps calling extract_items unchanged, so origin validation for the
        unauthenticated SDK path is untouched.
        """
        await self._ensure_site_active(site_id)
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
            if existing and existing.get("text") and existing.get("status") == "approved":
                result[doc["key"]] = existing["text"]
            else:
                result[doc["key"]] = doc["sourceText"]
        return result

    # Batch limits for on-demand runtime translation (Azure /translate accepts an
    # array; keep each request under its item + character caps).
    _RUNTIME_BATCH_ITEMS = 50
    _RUNTIME_BATCH_CHARS = 45_000

    async def _persist_translation(
        self, site_id: str, route: str, doc: dict[str, Any], lang: str,
        translated: str, provider_name: str, quality_score: float | None,
        auto_approved: bool = False,
    ) -> None:
        actor = f"system:{provider_name}"
        await self._repo.save_translation(
            site_id=site_id, route=route, key=doc["key"], lang=lang,
            text=translated, provider=provider_name, quality_score=quality_score, created_by=actor,
            auto_approved=auto_approved,
        )
        await self._audit(
            translation_id=str(doc["_id"]), site_id=site_id, route=route, key=doc["key"],
            action="translated", actor=actor, lang=lang, provider=provider_name,
        )

    async def runtime_translate(
        self,
        site_id: str,
        route: str,
        lang: str,
        origin: str | None = None,
        referer: str | None = None,
    ) -> dict[str, str]:
        """On-demand runtime path for the SDK: return {key: text} for every item on
        *route*, generating any missing *lang* translations inline via the provider.

        Extracted items with no *lang* translation yet are run through glossary ->
        Translation Memory -> AI (batched) and stored as a draft. Only APPROVED
        documents are ever served to the caller; a freshly-generated AI translation
        is persisted but still falls back to source text until a human approves it.
        Translation Memory reuse is the one exception: it auto-approves at persist
        time, since a TM hit is by construction reusing content a human already
        approved elsewhere.

        Batching + a fast MT provider (Azure: no LLM token/day cap) keep this from
        stalling. If generation transiently fails for an item, that item falls back
        to its source text (never null, never a persisted placeholder), and retries
        on a later request.
        """
        website = await self._ensure_site_active(site_id)
        self._ensure_origin_matches(website, origin, referer)
        return await self._generate_translations(site_id, route, lang)

    async def generate_for_review(self, site_id: str, route: str, lang: str) -> dict[str, str]:
        """Authenticated equivalent of runtime_translate for the admin/reviewer UI.

        Same on-demand glossary -> TM -> AI generation as the public SDK path,
        but callable only by an authenticated admin/reviewer (see
        require_admin_or_reviewer on the /translations/generate route) instead
        of being bound to the site's registered domain via Origin/Referer —
        authentication replaces origin verification for this internal path.
        _ensure_origin_matches is deliberately never called here.
        """
        await self._ensure_site_active(site_id)
        return await self._generate_translations(site_id, route, lang)

    def _is_first_party(self, site_id: str) -> bool:
        """True only for siteIds explicitly listed in FIRST_PARTY_SITE_IDS.

        First-party (ContentWebApp's own UI) AI translations are served at
        runtime without human approval. Identity is by exact siteId from config
        only — never domain/localhost/route/role. Empty config => always False,
        so every site keeps the approval gate until a siteId is opted in.
        """
        ids = getattr(get_settings(), "first_party_site_ids", "") or ""
        if not ids:
            return False
        return site_id in {s.strip() for s in ids.split(",") if s.strip()}

    async def _generate_translations(self, site_id: str, route: str, lang: str) -> dict[str, str]:
        await self._ensure_lang_enabled(lang)
        first_party = self._is_first_party(site_id)
        docs = await self._repo.find_by_route(site_id, route)
        result: dict[str, str] = {}
        glossary_cache: dict[str, list[dict[str, Any]]] = {}
        pending: list[tuple[dict[str, Any], str, dict[str, str], str, str]] = []

        for doc in docs:
            existing = (doc.get("translations") or {}).get(lang)
            if existing and existing.get("text"):
                # First-party (ContentWebApp UI): serve the AI text regardless of
                # approval status. Partner: approved-only, else source (gate intact).
                serve_unapproved = first_party
                result[doc["key"]] = (
                    existing["text"]
                    if (existing.get("status") == "approved" or serve_unapproved)
                    else doc["sourceText"]
                )
                continue

            source_lang = doc.get("sourceLang", "en")
            if lang not in glossary_cache:
                glossary_cache[lang] = await self._glossary_repo.find_by_lang(lang)
            normalized = self._glossary.apply(doc["sourceText"], glossary_cache[lang])

            tm_hit = await self._repo.find_exact_match(site_id, doc["sourceText"], source_lang, lang)
            if tm_hit:
                translated = tm_hit["translations"][lang]["text"]
                await self._persist_translation(
                    site_id, route, doc, lang, translated, "TranslationMemory", 1.0, auto_approved=True
                )
                result[doc["key"]] = translated
                continue

            masked, pmap = mask(normalized)
            pending.append((doc, masked, pmap, source_lang, normalized))

        await self._runtime_batch_ai(site_id, route, lang, pending, result, first_party)
        return result

    async def _runtime_batch_ai(self, site_id, route, lang, pending, result, first_party=False) -> None:
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
                    for (doc, _m, pmap, _s, normalized), out in zip(chunk, outs, strict=True):
                        translated = unmask(out, pmap)
                        quality = score_translation(normalized, out, pmap)
                        await self._persist_translation(site_id, route, doc, lang, translated, type(self._provider).__name__, quality)
                        # First-party serves the fresh AI text now; partner serves
                        # source (draft stays pending until a human approves).
                        result[doc["key"]] = translated if first_party else doc["sourceText"]
                except (TransientTranslationError, ValueError):
                    for doc, masked, pmap, _s, normalized in chunk:
                        try:
                            out = await self._provider.translate(masked, source_lang, lang)
                        except TransientTranslationError:
                            result[doc["key"]] = doc["sourceText"]
                            continue
                        translated = unmask(out, pmap)
                        quality = score_translation(normalized, out, pmap)
                        await self._persist_translation(site_id, route, doc, lang, translated, type(self._provider).__name__, quality)
                        # Gate on the per-language status just written
                        # (translations.{lang}.status is "pending" for a fresh AI
                        # draft), never the document-level status: a Translation
                        # Memory auto-approve on another language sets the doc-
                        # level status to "approved" and must not leak this
                        # unreviewed draft. Pending -> serve source, matching the
                        # batch-success branch above. First-party (ContentWebApp UI)
                        # is the sole runtime exemption: serve the AI text now.
                        result[doc["key"]] = translated if first_party else doc["sourceText"]

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
        AI provider, then persist as a draft. Only APPROVED translations are
        ever served to the caller; everything else (draft, pending review,
        rejected) falls back to source text. Translation Memory reuse is the
        one exception: it auto-approves at persist time, since a TM hit is by
        construction reusing content a human already approved elsewhere.

        If the AI provider transiently fails for an item, that item is SKIPPED
        (its source text is returned) rather than persisting a fabricated
        placeholder — so a rate-limit blip never poisons the DB, and the item
        retries on a later request. The SDK therefore never receives null and
        never receives placeholder text like "[ta] ...".
        """
        docs = await self._repo.find_by_route(site_id, route)
        result: dict[str, str] = {}
        first_party = self._is_first_party(site_id)

        for doc in docs:
            existing = (doc.get("translations") or {}).get(lang)
            if existing and existing.get("text"):
                # First-party (ContentWebApp UI) serves AI text regardless of
                # approval status; partner stays approved-only (gate intact).
                result[doc["key"]] = (
                    existing["text"]
                    if (existing.get("status") == "approved" or first_party)
                    else doc["sourceText"]
                )
                continue

            source_lang = doc.get("sourceLang", "en")
            glossary_terms = await self._glossary_repo.find_by_lang(lang)
            normalized_text = self._glossary.apply(doc["sourceText"], glossary_terms)

            tm_hit = await self._repo.find_exact_match(site_id, doc["sourceText"], source_lang, lang)
            auto_approved = False
            if tm_hit:
                translated = tm_hit["translations"][lang]["text"]
                provider_name = "TranslationMemory"
                quality_score = 1.0  # already human-approved elsewhere
                auto_approved = True
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
                auto_approved=auto_approved,
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
            # This is a freshly persisted translation for a lang that had none
            # before, so its own approval state is exactly auto_approved
            # (True only for a Translation Memory hit) — no other language's
            # status on this document is relevant here. First-party (ContentWebApp
            # UI) additionally serves the fresh AI text now; partner serves source.
            result[doc["key"]] = translated if (auto_approved or first_party) else doc["sourceText"]

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

    async def bulk_approve_pending(
        self,
        site_id: str,
        approved_by: str,
        route: str | None = None,
        lang: str | None = None,
    ) -> dict[str, int]:
        """Approve every non-approved language on every matching document.

        Reuses approve_translation per (doc, lang) so each approval still gets
        its own version snapshot and audit entry — this is a batch driver, not
        a shortcut around the per-language approval gate.
        """
        docs = await self.list_translations(site_id, route=route)
        approved = 0
        skipped = 0
        for doc in docs:
            for doc_lang, entry in (doc.get("translations") or {}).items():
                if lang and doc_lang != lang:
                    continue
                if entry.get("status") == "approved":
                    skipped += 1
                    continue
                await self.approve_translation(str(doc["_id"]), doc_lang, approved_by)
                approved += 1
        return {"approved": approved, "skipped": skipped}

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

    async def approve_translation(self, translation_id: str, lang: str, approved_by: str) -> dict[str, Any]:
        """Approve *lang* on the document and append a version snapshot (never overwritten).

        Scoped to lang only: approving one language on a document must never
        approve, or otherwise change, any other language already on it.
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
        await self._repo.approve_translation(translation_id, lang, approved_by, version=next_version)
        await self._audit(
            translation_id=translation_id,
            site_id=doc["siteId"],
            route=doc["route"],
            key=doc["key"],
            action="approved",
            actor=approved_by,
            lang=lang,
            detail=f"version={next_version}",
        )
        return await self.get_translation(translation_id)

    async def reject_translation(self, translation_id: str, lang: str, rejected_by: str, reason: str) -> dict[str, Any]:
        """Reject *lang* on the document. Must never reject, or otherwise change,
        any other language already approved on it."""
        doc = await self.get_translation(translation_id)  # raises NotFoundError if missing
        await self._repo.reject_translation(translation_id, lang, rejected_by, reason)
        await self._audit(
            translation_id=translation_id,
            site_id=doc["siteId"],
            route=doc["route"],
            key=doc["key"],
            action="rejected",
            actor=rejected_by,
            lang=lang,
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
    return TranslationService(db, lambda: get_translation_provider(get_settings()))
