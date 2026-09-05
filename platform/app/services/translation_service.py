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
        self._enforce_origin_check = enforce_origin_check
        self._enforce_lang_validation = enforce_lang_validation

    @property
    def _provider(self) -> TranslationProvider:
        if self._provider_instance is None:
            self._provider_instance = self._provider_factory()
        return self._provider_instance

    async def _ensure_site_active(self, site_id: str) -> dict[str, Any]:
        website = await self._website_repo.find_by_site_id(site_id)
        if not website or website.get("status") != "Active":
            raise NotFoundError("website", site_id)
        return website

    @staticmethod
    def _hostname_of(header_value: str | None) -> str | None:
        if not header_value:
            return None
        return urlparse(header_value).hostname

    @staticmethod
    def _strip_www(host: str | None) -> str | None:
        if host and host.startswith("www."):
            return host[4:]
        return host

    def _ensure_origin_matches(
        self, website: dict[str, Any], origin: str | None, referer: str | None
    ) -> None:
        if not self._enforce_origin_check:
            return
        hostname = self._hostname_of(origin) or self._hostname_of(referer)
        domain = website.get("domain")
        if hostname == domain or self._strip_www(hostname) == self._strip_www(domain):
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
        translation_id: str,
        site_id: str,
        route: str,
        key: str,
        action: str,
        actor: str,
        lang: str | None = None,
        provider: str | None = None,
        detail: str = "",
    ) -> None:
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
        website = await self._ensure_site_active(site_id)
        self._ensure_origin_matches(website, origin, referer)
        for item in items:
            await self._repo.upsert_source(
                site_id=site_id,
                route=item["route"],
                key=item["key"],
                source_lang=item.get("source_lang", "en"),
                text=item["text"],
            )

    async def extract_items_for_review(self, site_id: str, items: list[dict[str, Any]]) -> None:
        await self._ensure_site_active(site_id)
        for item in items:
            await self._repo.upsert_source(
                site_id=site_id,
                route=item["route"],
                key=item["key"],
                source_lang=item.get("source_lang", "en"),
                text=item["text"],
            )

    async def get_stored_translations(self, site_id: str, route: str, lang: str) -> dict[str, str]:
        docs = await self._repo.find_by_route(site_id, route)
        result: dict[str, str] = {}
        for doc in docs:
            existing = (doc.get("translations") or {}).get(lang)
            if existing and existing.get("text") and existing.get("status") == "approved":
                result[doc["key"]] = existing["text"]
            else:
                result[doc["key"]] = doc["source_text"]
        return result

    _RUNTIME_BATCH_ITEMS = 50
    _RUNTIME_BATCH_CHARS = 45_000

    async def _persist_translation(
        self, site_id: str, route: str, doc: dict[str, Any], lang: str,
        translated: str, provider_name: str, quality_score: float = 1.0,
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
        website = await self._ensure_site_active(site_id)
        self._ensure_origin_matches(website, origin, referer)
        return await self._generate_translations(site_id, route, lang)

    async def generate_for_review(self, site_id: str, route: str, lang: str) -> dict[str, str]:
        await self._ensure_site_active(site_id)
        return await self._generate_translations(site_id, route, lang)

    def _is_first_party(self, site_id: str) -> bool:
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
                serve_unapproved = first_party
                result[doc["key"]] = (
                    existing["text"]
                    if (existing.get("status") == "approved" or serve_unapproved)
                    else doc["source_text"]
                )
                continue

            source_lang = doc.get("source_lang", "en")
            if lang not in glossary_cache:
                glossary_cache[lang] = await self._glossary_repo.find_by_lang(lang)
            normalized = self._glossary.apply(doc["source_text"], glossary_cache[lang])

            tm_hit = await self._repo.find_exact_match(site_id, doc["source_text"], source_lang, lang)
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
                        result[doc["key"]] = translated if first_party else doc["source_text"]
                except (TransientTranslationError, ValueError):
                    for doc, masked, pmap, _s, normalized in chunk:
                        try:
                            out = await self._provider.translate(masked, source_lang, lang)
                        except TransientTranslationError:
                            result[doc["key"]] = doc["source_text"]
                            continue
                        translated = unmask(out, pmap)
                        quality = score_translation(normalized, out, pmap)
                        await self._persist_translation(site_id, route, doc, lang, translated, type(self._provider).__name__, quality)
                        result[doc["key"]] = translated if first_party else doc["source_text"]

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
        docs = await self._repo.find_by_route(site_id, route)
        result: dict[str, str] = {}
        first_party = self._is_first_party(site_id)

        for doc in docs:
            existing = (doc.get("translations") or {}).get(lang)
            if existing and existing.get("text"):
                result[doc["key"]] = (
                    existing["text"]
                    if (existing.get("status") == "approved" or first_party)
                    else doc["source_text"]
                )
                continue

            source_lang = doc.get("source_lang", "en")
            glossary_terms = await self._glossary_repo.find_by_lang(lang)
            normalized_text = self._glossary.apply(doc["source_text"], glossary_terms)

            tm_hit = await self._repo.find_exact_match(site_id, doc["source_text"], source_lang, lang)
            auto_approved = False
            if tm_hit:
                translated = tm_hit["translations"][lang]["text"]
                provider_name = "TranslationMemory"
                quality_score = 1.0
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
                    result[doc["key"]] = doc["source_text"]
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
            result[doc["key"]] = translated if (auto_approved or first_party) else doc["source_text"]

        return result

    async def list_translations(
        self,
        site_id: str,
        route: str | None = None,
        status: str | None = None,
        low_confidence_only: bool = False,
    ) -> list[dict[str, Any]]:
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
                    is_low_confidence(t.get("quality_score"), threshold)
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
        doc = await self.get_translation(translation_id)
        await self._repo.update_translation_text(translation_id, lang, text)
        await self._audit(
            translation_id=translation_id,
            site_id=doc["site_id"],
            route=doc["route"],
            key=doc["key"],
            action="edited",
            actor=editor,
            lang=lang,
            detail=f"lang={lang}",
        )
        return await self.get_translation(translation_id)

    async def approve_translation(self, translation_id: str, lang: str, approved_by: str) -> dict[str, Any]:
        doc = await self.get_translation(translation_id)
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
            site_id=doc["site_id"],
            route=doc["route"],
            key=doc["key"],
            action="approved",
            actor=approved_by,
            lang=lang,
            detail=f"version={next_version}",
        )
        return await self.get_translation(translation_id)

    async def reject_translation(self, translation_id: str, lang: str, rejected_by: str, reason: str) -> dict[str, Any]:
        doc = await self.get_translation(translation_id)
        await self._repo.reject_translation(translation_id, lang, rejected_by, reason)
        await self._audit(
            translation_id=translation_id,
            site_id=doc["site_id"],
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
        if route and key:
            return await self._audit_repo.find_by_item(site_id, route, key)
        return await self._audit_repo.find_by_site(site_id, route=route, action=action, limit=limit)

    async def get_version_history(self, translation_id: str) -> list[dict[str, Any]]:
        await self.get_translation(translation_id)
        return await self._version_repo.find_by_translation(translation_id)


def get_translation_service(
    db: AsyncDatabase[Any] = Depends(get_db),
) -> TranslationService:
    return TranslationService(db, lambda: get_translation_provider(get_settings()))
