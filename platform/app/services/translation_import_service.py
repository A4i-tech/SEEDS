from __future__ import annotations

import logging
from collections import Counter
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from fastapi import Depends
from pymongo import UpdateOne
from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import BulkWriteError, PyMongoError

from app.models.requests.translation_requests import (
    ImportState,
    TranslationImportRow,
    js_trim,
)
from app.models.responses.translation import (
    ImportRowError,
    ImportRowReason,
    TranslationImportResponse,
)
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.repositories.translation_audit_repository import TranslationAuditRepository
from app.repositories.translation_repository import IMPORT_PROVIDER, TranslationRepository
from app.repositories.translation_version_repository import TranslationVersionRepository
from app.repositories.website_repository import WebsiteRepository
from app.services.sdk_rolling_hash import sdk_rolling_hash
from app.services.translation_service import _audit_doc, _version_doc, ensure_lang_enabled

logger = logging.getLogger(__name__)

IMPORT_QUALITY_SCORE = 1.0
IMPORT_SOURCE_LANG = "en"
_REJECTION_FIELDS = ("rejected_by", "rejected_at", "rejection_reason")
_REVIEW_FIELDS = ("approved_by", "approved_at", *_REJECTION_FIELDS)


def _normalize_newlines(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def _canonical_source(value: str) -> str:
    return js_trim(_normalize_newlines(value))


def _entry_fields(text: str, approving: bool, actor: str, now: datetime, *, is_new: bool) -> dict[str, Any]:
    fields: dict[str, Any] = {
        "text": text,
        "provider": IMPORT_PROVIDER,
        "quality_score": IMPORT_QUALITY_SCORE,
        "status": "approved" if approving else "pending",
    }
    if is_new:
        fields["created_by"] = actor
        fields["created_at"] = now
    if approving:
        fields["approved_by"] = actor
        fields["approved_at"] = now
    return fields


def _same_instant(stored: datetime | None, expected: datetime) -> bool:
    if stored is None:
        return False
    millis = expected.microsecond // 1000 * 1000
    return stored.replace(tzinfo=None) == expected.replace(tzinfo=None, microsecond=millis)


def _plan_clear(
    site_id: str, lang: str, actor: str, now: datetime, row_no: int, doc: dict[str, Any]
) -> tuple[UpdateOne, dict[str, Any]]:
    op = UpdateOne(
        {"_id": doc["_id"]},
        {
            "$unset": {f"translations.{lang}": ""},
            "$set": {"updated_at": now},
            "$push": {"audit_log": {"action": "cleared", "actor": actor, "detail": f"lang={lang}", "at": now}},
        },
    )
    audit = _audit_doc(site_id, doc["route"], doc["key"], lang, "cleared", actor, None, "", now)
    plan = {
        "row": row_no,
        "route": doc["route"],
        "key": doc["key"],
        "kind": "updated",
        "audits": [audit],
        "version_doc": None,
    }
    return op, plan


def _plan_upsert(
    site_id: str,
    lang: str,
    actor: str,
    state: ImportState,
    now: datetime,
    row_no: int,
    route: str,
    key: str,
    source: str,
    text: str,
    doc: dict[str, Any] | None,
) -> tuple[UpdateOne, dict[str, Any]]:
    base = f"translations.{lang}"
    approving = state == "approved"
    is_new = doc is None
    existing_translations = {} if is_new else doc["translations"]
    entry = existing_translations.get(lang)
    version = (0 if is_new else doc.get("version", 0)) + 1
    new_id = ObjectId() if is_new else None

    set_fields: dict[str, Any] = {f"{base}.text": text, "updated_at": now}
    unset_fields: dict[str, str] = {}
    if is_new or state != "keep" or entry is None:
        entry_fields = _entry_fields(text, approving, actor, now, is_new=is_new or entry is None)
        set_fields.update({f"{base}.{field}": value for field, value in entry_fields.items() if field != "text"})
        review_fields = _REJECTION_FIELDS if approving else _REVIEW_FIELDS
        unset_fields = {f"{base}.{field}": "" for field in review_fields}
    if approving:
        set_fields.update({"status": "approved", "approved_by": actor, "approved_at": now, "version": version})
    update: dict[str, Any] = {"$set": set_fields}
    if unset_fields:
        update["$unset"] = unset_fields
    if is_new:
        update["$setOnInsert"] = {
            "_id": new_id,
            "site_id": site_id,
            "route": route,
            "key": key,
            "source_lang": IMPORT_SOURCE_LANG,
            "source_text": source,
            "created_at": now,
        }
        query: dict[str, Any] = {"site_id": site_id, "route": route, "key": key}
    else:
        query = {"_id": doc["_id"]}
        if approving:
            query["version"] = doc.get("version", {"$exists": False})

    log_entries = [{"action": "imported", "actor": actor, "detail": f"lang={lang};state={state}", "at": now}]
    audits = [_audit_doc(site_id, route, key, lang, "imported", actor, IMPORT_PROVIDER, f"state={state}", now)]
    version_doc = None
    if approving:
        log_entries.append({"action": "approved", "actor": actor, "detail": f"version={version}", "at": now})
        audits.append(_audit_doc(site_id, route, key, lang, "approved", actor, None, f"version={version}", now))
        approved_entry = {
            **(entry or {}),
            "text": text,
            "provider": IMPORT_PROVIDER,
            "quality_score": IMPORT_QUALITY_SCORE,
            "status": "approved",
        }
        version_doc = {
            **_version_doc(version, {**existing_translations, lang: approved_entry}, actor, now),
            "translation_id": str(new_id if is_new else doc["_id"]),
        }
    update["$push"] = {"audit_log": {"$each": log_entries}}
    plan = {
        "row": row_no,
        "route": route,
        "key": key,
        "kind": "created" if is_new else "updated",
        "audits": audits,
        "version_doc": version_doc,
    }
    return UpdateOne(query, update, upsert=is_new), plan


class TranslationImportService:
    def __init__(self, db: AsyncDatabase) -> None:
        self._repo = TranslationRepository(db)
        self._version_repo = TranslationVersionRepository(db)
        self._audit_repo = TranslationAuditRepository(db)
        self._website_repo = WebsiteRepository(db)

    async def import_translations(
        self,
        site_id: str,
        tenant_id: str,
        actor: str,
        lang: str,
        rows: list[TranslationImportRow],
        overwrite_blank: bool = False,
        state: ImportState = "pending",
    ) -> TranslationImportResponse:
        website = await self._website_repo.find_by_site_id(site_id)
        if not website or website.get("tenant_id") != tenant_id or website.get("status") != "Active":
            raise NotFoundError("website", site_id)
        ensure_lang_enabled(website, lang)

        counts, errors, ops, planned, now = await self._plan(site_id, lang, rows, overwrite_blank, state, actor)
        failed, unconfirmed = await self._write(ops, planned, site_id)
        warnings = await self._record(site_id, now, planned, failed, unconfirmed, counts, errors)

        errors.sort(key=lambda e: e.row)
        warnings.sort(key=lambda w: w.row)
        return TranslationImportResponse(**counts, failed=len(errors), errors=errors, warnings=warnings)

    async def _plan(
        self,
        site_id: str,
        lang: str,
        rows: list[TranslationImportRow],
        overwrite_blank: bool,
        state: ImportState,
        actor: str,
    ) -> tuple[Counter[str], list[ImportRowError], list[UpdateOne], list[dict[str, Any]], datetime]:
        counts: Counter[str] = Counter(updated=0, created=0, unchanged=0, skipped_blank=0)
        errors: list[ImportRowError] = []

        def fail(row_no: int, route: str, key: str, reason: ImportRowReason) -> None:
            errors.append(ImportRowError(row=row_no, route=route, key=key, reason=reason))

        parsed: list[tuple[int, str, str, str, str]] = []
        seen: set[tuple[str, str]] = set()
        for row in rows:
            source = _canonical_source(row.source)
            reason = "missing_source" if not source else "duplicate_row" if (row.route, row.key) in seen else None
            if reason:
                fail(row.row, row.route, row.key, reason)
                continue
            seen.add((row.route, row.key))
            parsed.append((row.row, row.route, row.key, source, _normalize_newlines(row.text)))

        existing: dict[tuple[str, str], dict[str, Any]] = {}
        if parsed:
            docs = await self._repo.find_by_route_keys(site_id, sorted({(route, key) for _, route, key, _, _ in parsed}))
            existing = {(doc["route"], doc["key"]): doc for doc in docs}

        now = datetime.now(UTC)
        ops: list[UpdateOne] = []
        planned: list[dict[str, Any]] = []

        for row_no, route, key, source, text in parsed:
            doc = existing.get((route, key))
            entry = doc["translations"].get(lang) if doc is not None else None
            current = _normalize_newlines((entry or {}).get("text") or "")

            if doc is not None and _canonical_source(doc.get("source_text") or "") != source:
                fail(row_no, route, key, "source_mismatch")
                continue

            if not text.strip():
                if doc is None or not overwrite_blank:
                    counts["skipped_blank"] += 1
                elif not current:
                    counts["unchanged"] += 1
                else:
                    op, plan = _plan_clear(site_id, lang, actor, now, row_no, doc)
                    ops.append(op)
                    planned.append(plan)
                continue

            if doc is None and sdk_rolling_hash(source) != key:
                fail(row_no, route, key, "key_mismatch")
                continue
            if doc is not None and text == current and (state != "approved" or (entry or {}).get("status") == "approved"):
                counts["unchanged"] += 1
                continue

            op, plan = _plan_upsert(site_id, lang, actor, state, now, row_no, route, key, source, text, doc)
            ops.append(op)
            planned.append(plan)

        return counts, errors, ops, planned, now

    async def _write(self, ops: list[UpdateOne], planned: list[dict[str, Any]], site_id: str) -> tuple[set[int], int]:
        if not ops:
            return set(), 0
        try:
            result = await self._repo.bulk_write(ops)
            return set(), len(ops) - result.matched_count - result.upserted_count
        except BulkWriteError as exc:
            write_errors = exc.details["writeErrors"]
            failed = {err["index"] for err in write_errors}
            logger.warning(
                "import_translations: %d row(s) failed to write",
                len(failed),
                extra={
                    "site_id": site_id,
                    "failed_rows": sorted(planned[i]["row"] for i in failed),
                    "errors": [{"code": err.get("code"), "errmsg": err.get("errmsg")} for err in write_errors],
                },
                exc_info=True,
            )
            write_concern_errors = exc.details.get("writeConcernErrors")
            if write_concern_errors:
                logger.error(
                    "import_translations: bulk_write reported write concern error(s); "
                    "rows not already marked failed could not be confirmed as durably written",
                    extra={"site_id": site_id, "errors": write_concern_errors},
                )
            return failed, len(ops) if write_concern_errors else 0
        except PyMongoError:
            logger.error(
                "import_translations: bulk_write raised an unexpected database error; "
                "row outcomes could not be confirmed from the write call itself",
                extra={"site_id": site_id, "row_count": len(planned)},
                exc_info=True,
            )
            return set(), len(ops)

    async def _record(
        self,
        site_id: str,
        now: datetime,
        planned: list[dict[str, Any]],
        failed: set[int],
        unconfirmed: int,
        counts: Counter[str],
        errors: list[ImportRowError],
    ) -> list[ImportRowError]:
        warnings: list[ImportRowError] = []

        def warn(plan: dict[str, Any], reason: ImportRowReason) -> None:
            warnings.append(ImportRowError(row=plan["row"], route=plan["route"], key=plan["key"], reason=reason))

        guarded = [i for i, p in enumerate(planned) if p["version_doc"] and i not in failed]
        unverified: set[int] = set()
        guard_mismatched: set[int] = set()
        if guarded:
            try:
                stored = await self._repo.find_by_route_keys(
                    site_id, [(planned[i]["route"], planned[i]["key"]) for i in guarded]
                )
            except PyMongoError:
                logger.error(
                    "import_translations: rows were saved but their version-guard status could not be verified",
                    extra={"site_id": site_id, "rows": [planned[i]["row"] for i in guarded]},
                    exc_info=True,
                )
                unverified = set(guarded)
            else:
                applied_at = {(d["route"], d["key"]): _same_instant(d.get("approved_at"), now) for d in stored}
                guard_mismatched = {i for i in guarded if not applied_at.get((planned[i]["route"], planned[i]["key"]))}
                if guard_mismatched:
                    logger.warning(
                        "import_translations: %d row(s) failed the version guard (doc changed concurrently)",
                        len(guard_mismatched),
                        extra={"site_id": site_id, "rows": [planned[i]["row"] for i in guard_mismatched]},
                    )
                failed |= guard_mismatched

        if unconfirmed > len(guard_mismatched):
            unverified |= {i for i in range(len(planned)) if i not in failed and i not in guarded}

        for i, p in enumerate(planned):
            if i in failed:
                errors.append(ImportRowError(row=p["row"], route=p["route"], key=p["key"], reason="write_failed"))
                continue
            counts[p["kind"]] += 1
            if i in unverified:
                warn(p, "save_not_confirmed")

        written = [p for i, p in enumerate(planned) if i not in failed]
        versioned = [p for i, p in enumerate(planned) if p["version_doc"] and i not in failed | unverified]
        if versioned:
            try:
                await self._version_repo.add_versions_bulk([p["version_doc"] for p in versioned])
            except PyMongoError:
                logger.error(
                    "import_translations: rows were saved but their versions were not recorded",
                    extra={"site_id": site_id, "rows": [p["row"] for p in versioned]},
                    exc_info=True,
                )
                for p in versioned:
                    warn(p, "version_not_recorded")
        audit_docs = [audit for p in written for audit in p["audits"]]
        if audit_docs:
            try:
                await self._audit_repo.record_bulk(audit_docs)
            except PyMongoError:
                logger.error(
                    "import_translations: rows were saved but their audit entries were not recorded",
                    extra={"site_id": site_id, "rows": [p["row"] for p in written]},
                    exc_info=True,
                )
                for p in written:
                    warn(p, "audit_not_recorded")

        return warnings


def get_translation_import_service(db: AsyncDatabase = Depends(get_db)) -> TranslationImportService:
    return TranslationImportService(db)
