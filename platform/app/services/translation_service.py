from __future__ import annotations

import logging
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any

from fastapi import Depends
from pymongo import UpdateOne
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import BulkWriteError

from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError, ValidationError
from app.platform.settings import get_settings
from app.providers.translation_provider import (
    TransientTranslationError,
    TranslationProvider,
    get_translation_provider,
)
from app.repositories.glossary_repository import GlossaryRepository
from app.repositories.translation_audit_repository import TranslationAuditRepository
from app.repositories.translation_repository import IMPORT_PROVIDER, TranslationRepository
from app.repositories.translation_version_repository import TranslationVersionRepository
from app.repositories.website_repository import WebsiteRepository
from app.services.glossary_normalizer import GlossaryNormalizer
from app.services.placeholder_protector import mask, unmask
from app.services.quality_scorer import is_low_confidence, score_translation
from app.services.sdk_rolling_hash import js_trim, sdk_rolling_hash

logger = logging.getLogger(__name__)

IMPORT_TEXT_MAX_LENGTH = 5000
IMPORT_ROUTE_MAX_LENGTH = 2048
_ROUTE_FORBIDDEN_CHARS = frozenset(['"', "#", "<", ">", "?", "^", "`", "{", "}", chr(92)])
_REJECTION_FIELDS = ("rejected_by", "rejected_at", "rejection_reason")
_REVIEW_FIELDS = ("approved_by", "approved_at", *_REJECTION_FIELDS)


def _normalize_newlines(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def _canonical_source(value: str) -> str:
    return js_trim(_normalize_newlines(value))


def _is_url_pathname(route: str) -> bool:
    if len(route) > IMPORT_ROUTE_MAX_LENGTH or not route.startswith("/"):
        return False
    if not all("!" <= char <= "~" and char not in _ROUTE_FORBIDDEN_CHARS for char in route):
        return False
    return not any(segment in (".", "..") for segment in route.split("/"))


def _import_row_error(route: str, key: str, source: str, text: str) -> str | None:
    if not key:
        return "missing_key"
    if not route:
        return "missing_route"
    if not _is_url_pathname(route):
        return "invalid_route"
    if not source:
        return "missing_source"
    if len(source) > IMPORT_TEXT_MAX_LENGTH:
        return "source_too_long"
    if len(text) > IMPORT_TEXT_MAX_LENGTH:
        return "text_too_long"
    return None


class TranslationService:
    _RUNTIME_BATCH_ITEMS = 50
    _RUNTIME_BATCH_CHARS = 45_000

    def __init__(
        self,
        db: AsyncDatabase,
        provider_factory: Callable[[], TranslationProvider],
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

    async def _ensure_site_owned_by_tenant(self, site_id: str, tenant_id: str) -> dict[str, Any]:
        website = await self._website_repo.find_by_site_id(site_id)
        if not website or website.get("tenant_id") != tenant_id:
            raise NotFoundError("website", site_id)
        return website

    async def _get_translation_owned_by_tenant(self, translation_id: str, tenant_id: str) -> dict[str, Any]:
        doc = await self._repo.find_by_id(translation_id)
        if doc is None:
            raise NotFoundError("Translation", translation_id)
        await self._ensure_site_owned_by_tenant(doc["site_id"], tenant_id)
        return doc

    async def _ensure_lang_enabled(self, site_id: str, lang: str) -> None:
        if not self._enforce_lang_validation:
            return
        website = await self._website_repo.find_by_site_id(site_id)
        codes = {entry["code"] for entry in (website or {}).get("languages") or [] if entry.get("enabled")}
        if lang not in codes:
            raise ValidationError(f"lang {lang!r} is not an enabled language for this site")

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
    ) -> None:
        await self._ensure_site_active(site_id)
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

    async def runtime_translate(self, site_id: str, route: str, lang: str) -> dict[str, str]:
        await self._ensure_site_active(site_id)
        return await self._generate_translations(
            site_id, route, lang, serve_pending=self._is_first_party(site_id)
        )

    async def generate_for_review(self, site_id: str, tenant_id: str, route: str, lang: str) -> dict[str, str]:
        website = await self._ensure_site_owned_by_tenant(site_id, tenant_id)
        if website.get("status") != "Active":
            raise NotFoundError("website", site_id)
        return await self._generate_translations(site_id, route, lang, serve_pending=True)

    def _is_first_party(self, site_id: str) -> bool:
        ids = getattr(get_settings(), "first_party_site_ids", "") or ""
        if not ids:
            return False
        return site_id in {s.strip() for s in ids.split(",") if s.strip()}

    async def _generate_translations(
        self, site_id: str, route: str, lang: str, serve_pending: bool
    ) -> dict[str, str]:
        await self._ensure_lang_enabled(site_id, lang)
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

        await self._runtime_batch_ai(site_id, route, lang, pending, result, serve_pending)
        return result

    async def _runtime_batch_ai(self, site_id, route, lang, pending, result, serve_pending) -> None:
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
                        result[doc["key"]] = translated if serve_pending else doc["source_text"]
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
                        result[doc["key"]] = translated if serve_pending else doc["source_text"]

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
        tenant_id: str | None = None,
        route: str | None = None,
        status: str | None = None,
        low_confidence_only: bool = False,
    ) -> list[dict[str, Any]]:
        if tenant_id is not None:
            await self._ensure_site_owned_by_tenant(site_id, tenant_id)
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
        tenant_id: str,
        approved_by: str,
        route: str | None = None,
        lang: str | None = None,
    ) -> dict[str, int]:
        await self._ensure_site_owned_by_tenant(site_id, tenant_id)
        docs = await self.list_translations(site_id, route=route)

        now = datetime.now(UTC)
        ops: list[UpdateOne] = []
        op_translation_ids: list[str] = []
        op_lang_counts: list[int] = []
        versions_by_translation: dict[str, list[dict[str, Any]]] = {}
        audits_by_translation: dict[str, list[dict[str, Any]]] = {}
        approved = 0
        skipped = 0

        for doc in docs:
            translation_id = str(doc["_id"])
            translations_snapshot = dict(doc.get("translations") or {})
            version = doc.get("version", 0)
            set_fields: dict[str, Any] = {}
            audit_pushes: list[dict[str, Any]] = []
            lang_count = 0

            for doc_lang, entry in (doc.get("translations") or {}).items():
                if lang and doc_lang != lang:
                    continue
                if entry.get("status") in ("approved", "rejected"):
                    skipped += 1
                    continue

                version += 1
                versions_by_translation.setdefault(translation_id, []).append({
                    "translation_id": translation_id,
                    "version": version,
                    "translations": translations_snapshot,
                    "approved_by": approved_by,
                    "approved_at": now,
                    "created_at": now,
                })
                set_fields[f"translations.{doc_lang}.status"] = "approved"
                set_fields[f"translations.{doc_lang}.approved_by"] = approved_by
                set_fields[f"translations.{doc_lang}.approved_at"] = now
                set_fields[f"translations.{doc_lang}.quality_score"] = 1.0
                set_fields["status"] = "approved"
                set_fields["approved_by"] = approved_by
                set_fields["approved_at"] = now
                set_fields["version"] = version
                set_fields["updated_at"] = now
                audit_pushes.append(
                    {"action": "approved", "actor": approved_by, "detail": f"version={version}", "at": now}
                )
                audits_by_translation.setdefault(translation_id, []).append({
                    "site_id": site_id,
                    "route": doc["route"],
                    "key": doc["key"],
                    "lang": doc_lang,
                    "action": "approved",
                    "actor": approved_by,
                    "provider": None,
                    "detail": f"version={version}",
                    "at": now,
                })
                translations_snapshot = {
                    **translations_snapshot,
                    doc_lang: {**entry, "status": "approved", "approved_by": approved_by, "approved_at": now},
                }
                approved += 1
                lang_count += 1

            if lang_count:
                ops.append(
                    UpdateOne(
                        {"_id": doc["_id"]},
                        {"$set": set_fields, "$push": {"audit_log": {"$each": audit_pushes}}},
                    )
                )
                op_translation_ids.append(translation_id)
                op_lang_counts.append(lang_count)

        failed = 0
        failed_translation_ids: set[str] = set()
        if ops:
            try:
                await self._repo.bulk_approve(ops)
            except BulkWriteError as exc:
                for err in exc.details.get("writeErrors", []):
                    idx = err["index"]
                    failed_translation_ids.add(op_translation_ids[idx])
                    failed += op_lang_counts[idx]
                approved -= failed
                logger.warning(
                    "bulk_approve_pending: %d translation(s) failed to update",
                    failed,
                    extra={"site_id": site_id, "route": route},
                )

        version_docs = [
            v for tid, vs in versions_by_translation.items() if tid not in failed_translation_ids for v in vs
        ]
        audit_docs = [
            a for tid, aes in audits_by_translation.items() if tid not in failed_translation_ids for a in aes
        ]
        if version_docs:
            await self._version_repo.add_versions_bulk(version_docs)
        if audit_docs:
            await self._audit_repo.record_bulk(audit_docs)

        return {"approved": approved, "skipped": skipped, "failed": failed}

    async def import_translations(
        self,
        site_id: str,
        tenant_id: str,
        actor: str,
        lang: str,
        rows: list[dict[str, str]],
        overwrite_blank: bool = False,
        state: str = "pending",
    ) -> dict[str, Any]:
        website = await self._ensure_site_owned_by_tenant(site_id, tenant_id)
        if website.get("status") != "Active":
            raise NotFoundError("website", site_id)
        await self._ensure_lang_enabled(site_id, lang)

        counts = {"updated": 0, "created": 0, "unchanged": 0, "skipped_blank": 0}
        errors: list[dict[str, Any]] = []

        def fail(row_no: int, route: str, key: str, reason: str) -> None:
            errors.append({"row": row_no, "route": route, "key": key, "reason": reason})

        parsed: list[tuple[int, str, str, str, str]] = []
        seen: set[tuple[str, str]] = set()
        for row_no, row in enumerate(rows, start=1):
            route = row.get("route") or ""
            key = (row.get("key") or "").strip()
            source = _canonical_source(row.get("source") or "")
            text = _normalize_newlines(row.get("text") or "")
            reason = _import_row_error(route, key, source, text)
            if reason is None and (route, key) in seen:
                reason = "duplicate_row"
            if reason:
                fail(row_no, route, key, reason)
                continue
            seen.add((route, key))
            parsed.append((row_no, route, key, source, text))

        existing: dict[tuple[str, str], dict[str, Any]] = {}
        if parsed:
            docs = await self._repo.find_by_route_keys(
                site_id, sorted({(route, key) for _, route, key, _, _ in parsed})
            )
            existing = {(doc["route"], doc["key"]): doc for doc in docs}

        now = datetime.now(UTC)
        base = f"translations.{lang}"
        approving = state == "approved"
        ops: list[UpdateOne] = []
        planned: list[dict[str, Any]] = []

        for row_no, route, key, source, text in parsed:
            doc = existing.get((route, key))
            entry = ((doc or {}).get("translations") or {}).get(lang)
            current = (entry or {}).get("text") or ""

            if doc is not None and _canonical_source(doc.get("source_text") or "") != source:
                fail(row_no, route, key, "source_mismatch")
                continue

            if not text.strip():
                if doc is None or not overwrite_blank:
                    counts["skipped_blank"] += 1
                elif not current:
                    counts["unchanged"] += 1
                else:
                    ops.append(
                        UpdateOne(
                            {"_id": doc["_id"]},
                            {
                                "$unset": {base: ""},
                                "$set": {"updated_at": now},
                                "$push": {
                                    "audit_log": {"action": "cleared", "actor": actor, "detail": f"lang={lang}", "at": now}
                                },
                            },
                        )
                    )
                    cleared_audit = {
                        "site_id": site_id,
                        "route": route,
                        "key": key,
                        "lang": lang,
                        "action": "cleared",
                        "actor": actor,
                        "provider": None,
                        "detail": "",
                        "at": now,
                    }
                    planned.append(
                        {"row": row_no, "route": route, "key": key, "kind": "updated", "audits": [cleared_audit]}
                    )
                continue

            if doc is None and sdk_rolling_hash(source) != key:
                fail(row_no, route, key, "key_mismatch")
                continue
            if doc is not None and text == current:
                counts["unchanged"] += 1
                continue

            version = (doc or {}).get("version", 0) + 1
            if doc is None:
                new_entry: dict[str, Any] = {
                    "text": text,
                    "provider": IMPORT_PROVIDER,
                    "quality_score": 1.0,
                    "created_by": actor,
                    "created_at": now,
                    "status": "approved" if approving else "pending",
                }
                set_fields: dict[str, Any] = {base: new_entry, "updated_at": now}
                if approving:
                    new_entry.update({"approved_by": actor, "approved_at": now})
                    set_fields.update(
                        {"status": "approved", "approved_by": actor, "approved_at": now, "version": version}
                    )
                update: dict[str, Any] = {
                    "$setOnInsert": {
                        "site_id": site_id,
                        "route": route,
                        "key": key,
                        "source_lang": "en",
                        "source_text": source,
                        "created_at": now,
                    },
                    "$set": set_fields,
                }
                query: dict[str, Any] = {"site_id": site_id, "route": route, "key": key}
                kind = "created"
            else:
                set_fields = {f"{base}.text": text, "updated_at": now}
                unset_fields: dict[str, str] = {}
                if state != "keep" or entry is None:
                    set_fields[f"{base}.provider"] = IMPORT_PROVIDER
                    set_fields[f"{base}.quality_score"] = 1.0
                    set_fields[f"{base}.status"] = "pending"
                    review_fields = _REJECTION_FIELDS if approving else _REVIEW_FIELDS
                    unset_fields = {f"{base}.{field}": "" for field in review_fields}
                if entry is None:
                    set_fields[f"{base}.created_by"] = actor
                    set_fields[f"{base}.created_at"] = now
                if approving:
                    set_fields.update(
                        {
                            f"{base}.status": "approved",
                            f"{base}.approved_by": actor,
                            f"{base}.approved_at": now,
                            "status": "approved",
                            "approved_by": actor,
                            "approved_at": now,
                            "version": version,
                        }
                    )
                update = {"$set": set_fields}
                if unset_fields:
                    update["$unset"] = unset_fields
                query = {"_id": doc["_id"]}
                kind = "updated"

            log_entries = [{"action": "imported", "actor": actor, "detail": f"lang={lang};state={state}", "at": now}]
            audits = [
                {
                    "site_id": site_id,
                    "route": route,
                    "key": key,
                    "lang": lang,
                    "action": "imported",
                    "actor": actor,
                    "provider": IMPORT_PROVIDER,
                    "detail": f"state={state}",
                    "at": now,
                }
            ]
            version_doc = None
            if approving:
                log_entries.append({"action": "approved", "actor": actor, "detail": f"version={version}", "at": now})
                audits.append({**audits[0], "action": "approved", "provider": None, "detail": f"version={version}"})
                version_doc = {
                    "version": version,
                    "translations": {
                        **((doc or {}).get("translations") or {}),
                        lang: {
                            **(entry or {}),
                            "text": text,
                            "provider": IMPORT_PROVIDER,
                            "quality_score": 1.0,
                            "status": "pending",
                        },
                    },
                    "approved_by": actor,
                    "approved_at": now,
                    "created_at": now,
                }
            update["$push"] = {"audit_log": {"$each": log_entries}}
            ops.append(UpdateOne(query, update, upsert=doc is None))
            planned.append(
                {
                    "row": row_no,
                    "route": route,
                    "key": key,
                    "kind": kind,
                    "audits": audits,
                    "version_doc": version_doc,
                    "translation_id": str(doc["_id"]) if doc else None,
                }
            )

        failed_ops: set[int] = set()
        if ops:
            try:
                await self._repo.bulk_write(ops)
            except BulkWriteError as exc:
                failed_ops = {err["index"] for err in exc.details.get("writeErrors", [])}
                logger.warning(
                    "import_translations: %d row(s) failed to write", len(failed_ops), extra={"site_id": site_id}
                )

        written = []
        for index, plan in enumerate(planned):
            if index in failed_ops:
                fail(plan["row"], plan["route"], plan["key"], "write_failed")
            else:
                counts[plan["kind"]] += 1
                written.append(plan)

        new_identities = [
            (p["route"], p["key"]) for p in written if p.get("version_doc") and p["translation_id"] is None
        ]
        new_ids: dict[tuple[str, str], str] = {}
        if new_identities:
            created_docs = await self._repo.find_by_route_keys(site_id, new_identities)
            new_ids = {(doc["route"], doc["key"]): str(doc["_id"]) for doc in created_docs}

        version_docs = [
            {**p["version_doc"], "translation_id": p["translation_id"] or new_ids[(p["route"], p["key"])]}
            for p in written
            if p.get("version_doc")
        ]
        audit_docs = [audit for p in written for audit in p["audits"]]
        if version_docs:
            await self._version_repo.add_versions_bulk(version_docs)
        if audit_docs:
            await self._audit_repo.record_bulk(audit_docs)

        errors.sort(key=lambda e: e["row"])
        return {**counts, "failed": len(errors), "errors": errors}

    async def get_translation(self, translation_id: str, tenant_id: str) -> dict[str, Any]:
        return await self._get_translation_owned_by_tenant(translation_id, tenant_id)

    async def update_translation(
        self, translation_id: str, tenant_id: str, lang: str, text: str, editor: str = ""
    ) -> dict[str, Any]:
        doc = await self._get_translation_owned_by_tenant(translation_id, tenant_id)
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
        return await self._get_translation_owned_by_tenant(translation_id, tenant_id)

    async def approve_translation(
        self, translation_id: str, tenant_id: str, lang: str, approved_by: str
    ) -> dict[str, Any]:
        doc = await self._get_translation_owned_by_tenant(translation_id, tenant_id)
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
        return await self._get_translation_owned_by_tenant(translation_id, tenant_id)

    async def reject_translation(
        self, translation_id: str, tenant_id: str, lang: str, rejected_by: str, reason: str
    ) -> dict[str, Any]:
        doc = await self._get_translation_owned_by_tenant(translation_id, tenant_id)
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
        return await self._get_translation_owned_by_tenant(translation_id, tenant_id)

    async def get_audit_trail(
        self,
        site_id: str,
        tenant_id: str,
        route: str | None = None,
        key: str | None = None,
        action: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        await self._ensure_site_owned_by_tenant(site_id, tenant_id)
        if route and key:
            return await self._audit_repo.find_by_item(site_id, route, key)
        return await self._audit_repo.find_by_site(site_id, route=route, action=action, limit=limit)

    async def get_version_history(self, translation_id: str, tenant_id: str) -> list[dict[str, Any]]:
        await self._get_translation_owned_by_tenant(translation_id, tenant_id)
        return await self._version_repo.find_by_translation(translation_id)


def get_translation_service(
    db: AsyncDatabase = Depends(get_db),
) -> TranslationService:
    return TranslationService(db, lambda: get_translation_provider(get_settings()))
