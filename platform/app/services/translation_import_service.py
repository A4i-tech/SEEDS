from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Any

from bson import ObjectId
from fastapi import Depends
from pymongo import UpdateOne
from pymongo.asynchronous.database import AsyncDatabase

from app.models.requests.translation_requests import (
    ImportState,
    ParsedRow,
    PlannedRow,
    TranslationImportRow,
    js_trim,
)
from app.models.responses.translation import (
    ImportRowError,
    ImportRowReason,
    TranslationImportResponse,
)
from app.models.translation import StoredVersionDoc, TranslationEntry
from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError
from app.repositories.translation_audit_repository import TranslationAuditRepository
from app.repositories.translation_repository import IMPORT_PROVIDER, TranslationRepository
from app.repositories.translation_version_repository import TranslationVersionRepository
from app.repositories.website_repository import WebsiteRepository
from app.services.sdk_rolling_hash import sdk_rolling_hash
from app.services.translation_service import _audit_doc, _version_doc, ensure_lang_enabled

IMPORT_QUALITY_SCORE = 1.0
IMPORT_SOURCE_LANG = "en"
_REJECTION_FIELDS = ("rejected_by", "rejected_at", "rejection_reason")
_REVIEW_FIELDS = ("approved_by", "approved_at", *_REJECTION_FIELDS)


def _normalize_newlines(value: str) -> str:
    return value.replace("\r\n", "\n").replace("\r", "\n")


def _canonical_source(value: str) -> str:
    return js_trim(_normalize_newlines(value))


def _same_instant(stored: datetime | None, expected: datetime) -> bool:
    if not stored:
        return False
    millis = expected.microsecond // 1000 * 1000
    return stored.replace(tzinfo=None) == expected.replace(tzinfo=None, microsecond=millis)


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
        if not website or website["tenant_id"] != tenant_id or website["status"] != "Active":
            raise NotFoundError("website", site_id)
        ensure_lang_enabled(website, lang)

        counts, errors, ops, planned, now = await self._plan(site_id, lang, rows, overwrite_blank, state, actor)
        await self._write(ops)
        await self._record(site_id, now, planned, counts, errors)

        errors.sort(key=lambda e: e.row)
        return TranslationImportResponse(**counts, failed=len(errors), errors=errors)

    async def _plan(
        self,
        site_id: str,
        lang: str,
        rows: list[TranslationImportRow],
        overwrite_blank: bool,
        state: ImportState,
        actor: str,
    ) -> tuple[Counter[str], list[ImportRowError], list[UpdateOne], list[PlannedRow], datetime]:
        counts: Counter[str] = Counter(updated=0, created=0, unchanged=0, skipped_blank=0)
        errors: list[ImportRowError] = []

        def fail(row_no: int, route: str, key: str, reason: ImportRowReason) -> None:
            errors.append(ImportRowError(row=row_no, route=route, key=key, reason=reason))

        parsed: list[ParsedRow] = []
        seen: set[tuple[str, str]] = set()
        for row in rows:
            source = _canonical_source(row.source)
            reason = "missing_source" if not source else "duplicate_row" if (row.route, row.key) in seen else None
            if reason:
                fail(row.row, row.route, row.key, reason)
                continue
            seen.add((row.route, row.key))
            parsed.append(ParsedRow(row.row, row.route, row.key, source, _normalize_newlines(row.text)))

        existing: dict[tuple[str, str], dict[str, Any]] = {}
        if parsed:
            docs = await self._repo.find_by_route_keys(site_id, sorted({(item.route, item.key) for item in parsed}))
            existing = {(doc["route"], doc["key"]): doc for doc in docs}

        now = datetime.now(UTC)
        ops: list[UpdateOne] = []
        planned: list[PlannedRow] = []
        approving = state == "approved"

        for item in parsed:
            doc = existing.get((item.route, item.key))
            entry = doc["translations"].get(lang) if doc else None
            current = _normalize_newlines(entry["text"] if entry else "")

            if doc and _canonical_source(doc["source_text"]) != item.source:
                fail(item.row, item.route, item.key, "source_mismatch")
                continue

            if not item.text.strip():
                if not doc or not overwrite_blank:
                    counts["skipped_blank"] += 1
                elif not current:
                    counts["unchanged"] += 1
                else:
                    ops.append(
                        UpdateOne(
                            {"_id": doc["_id"]},
                            {
                                "$unset": {f"translations.{lang}": ""},
                                "$set": {"updated_at": now},
                                "$push": {
                                    "audit_log": {
                                        "action": "cleared",
                                        "actor": actor,
                                        "detail": f"lang={lang}",
                                        "at": now,
                                    }
                                },
                            },
                        )
                    )
                    planned.append(
                        PlannedRow(
                            row=item.row,
                            route=item.route,
                            key=item.key,
                            kind="updated",
                            audits=[
                                _audit_doc(
                                    site_id, item.route, item.key, lang, "cleared", actor, None, "", now
                                )
                            ],
                            version_doc=None,
                        )
                    )
                continue

            if not doc and sdk_rolling_hash(item.source) != item.key:
                fail(item.row, item.route, item.key, "key_mismatch")
                continue
            if doc and item.text == current and (state != "approved" or entry["status"] == "approved"):
                counts["unchanged"] += 1
                continue

            base = f"translations.{lang}"
            is_new = not doc
            existing_translations: dict[str, TranslationEntry] = {} if is_new else doc["translations"]
            lang_entry = existing_translations.get(lang)
            version = (0 if is_new else doc.get("version", 0)) + 1
            new_id = ObjectId() if is_new else None

            set_fields: dict[str, Any] = {f"{base}.text": item.text, "updated_at": now}
            unset_fields: dict[str, str] = {}
            if is_new or state != "keep" or not lang_entry:
                set_fields.update(
                    {
                        f"{base}.provider": IMPORT_PROVIDER,
                        f"{base}.quality_score": IMPORT_QUALITY_SCORE,
                        f"{base}.status": "approved" if approving else "pending",
                    }
                )
                if is_new or not lang_entry:
                    set_fields.update({f"{base}.created_by": actor, f"{base}.created_at": now})
                if approving:
                    set_fields.update({f"{base}.approved_by": actor, f"{base}.approved_at": now})
                review_fields = _REJECTION_FIELDS if approving else _REVIEW_FIELDS
                unset_fields = {f"{base}.{field}": "" for field in review_fields}
            if approving:
                set_fields.update(
                    {"status": "approved", "approved_by": actor, "approved_at": now, "version": version}
                )
            update: dict[str, Any] = {"$set": set_fields}
            if unset_fields:
                update["$unset"] = unset_fields
            if is_new:
                update["$setOnInsert"] = {
                    "_id": new_id,
                    "site_id": site_id,
                    "route": item.route,
                    "key": item.key,
                    "source_lang": IMPORT_SOURCE_LANG,
                    "source_text": item.source,
                    "created_at": now,
                }
                query: dict[str, Any] = {"site_id": site_id, "route": item.route, "key": item.key}
            else:
                query = {"_id": doc["_id"]}
                if approving:
                    query["version"] = doc.get("version", {"$exists": False})

            log_entries = [
                {"action": "imported", "actor": actor, "detail": f"lang={lang};state={state}", "at": now}
            ]
            audits = [
                _audit_doc(
                    site_id, item.route, item.key, lang, "imported", actor, IMPORT_PROVIDER,
                    f"state={state}", now,
                )
            ]
            stored_version: StoredVersionDoc | None = None
            if approving:
                log_entries.append({"action": "approved", "actor": actor, "detail": f"version={version}", "at": now})
                audits.append(
                    _audit_doc(
                        site_id, item.route, item.key, lang, "approved", actor, None,
                        f"version={version}", now,
                    )
                )
                approved_entry: TranslationEntry = {
                    **(lang_entry if lang_entry else {}),
                    "text": item.text,
                    "provider": IMPORT_PROVIDER,
                    "quality_score": IMPORT_QUALITY_SCORE,
                    "status": "approved",
                }
                stored_version = StoredVersionDoc(
                    **_version_doc(version, {**existing_translations, lang: approved_entry}, actor, now),
                    translation_id=str(new_id) if is_new else str(doc["_id"]),
                )
            update["$push"] = {"audit_log": {"$each": log_entries}}
            ops.append(UpdateOne(query, update, upsert=is_new))
            planned.append(
                PlannedRow(
                    row=item.row,
                    route=item.route,
                    key=item.key,
                    kind="created" if is_new else "updated",
                    audits=audits,
                    version_doc=stored_version,
                )
            )

        return counts, errors, ops, planned, now

    async def _write(self, ops: list[UpdateOne]) -> None:
        if ops:
            await self._repo.bulk_write(ops)

    async def _record(
        self,
        site_id: str,
        now: datetime,
        planned: list[PlannedRow],
        counts: Counter[str],
        errors: list[ImportRowError],
    ) -> None:
        mismatched: set[int] = set()
        guarded = [i for i, p in enumerate(planned) if p["version_doc"]]
        if guarded:
            stored = await self._repo.find_by_route_keys(
                site_id, [(planned[i]["route"], planned[i]["key"]) for i in guarded]
            )
            applied_at = {(d["route"], d["key"]): _same_instant(d.get("approved_at"), now) for d in stored}
            mismatched = {i for i in guarded if not applied_at.get((planned[i]["route"], planned[i]["key"]))}

        for i, p in enumerate(planned):
            if i in mismatched:
                errors.append(ImportRowError(row=p["row"], route=p["route"], key=p["key"], reason="write_failed"))
                continue
            counts[p["kind"]] += 1

        written = [p for i, p in enumerate(planned) if i not in mismatched]
        versioned = [p["version_doc"] for p in written if p["version_doc"]]
        if versioned:
            await self._version_repo.add_versions_bulk(versioned)
        audit_docs = [audit for p in written for audit in p["audits"]]
        if audit_docs:
            await self._audit_repo.record_bulk(audit_docs)


def get_translation_import_service(db: AsyncDatabase = Depends(get_db)) -> TranslationImportService:
    return TranslationImportService(db)
