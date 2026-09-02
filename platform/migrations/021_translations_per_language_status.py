#!/usr/bin/env python3
"""
Migration 021 — Backfill per-language approval status on the translations collection.

Approval state used to live only at the document level (status/approvedBy/
approvedAt/rejectedBy/rejectedAt/rejectionReason), so approving Kannada on a
document also implicitly "approved" Malayalam on the same document at
runtime (both were gated by the same single field). Approval is now stored
per language at translations.{lang}.status, so each language's approval is
independent.

Originally this migration propagated a document's top-level status onto
every language missing translations.{lang}.status (approved -> approved,
rejected -> rejected). That was found to be unsafe against real data: the
pre-per-language "approve" action carried no language attribution at all
(translation_audit entries for every legacy "approved" action have
lang=None), so a document with e.g. 8 languages generated but only ONE ever
actually reviewed would have all 8 marked "approved" here — silently
auto-approving 7 languages a human never looked at. There is no reliable
signal anywhere in the legacy data (embedded auditLog, translation_audit
collection, or the document itself) that identifies which language, if any,
a pre-fix approval or rejection actually corresponded to.

This migration therefore now backfills every translations.{lang} entry that
is missing a status field to "pending", unconditionally — regardless of the
document's top-level status. This matches the product requirement (Extract
-> AI Generate -> Pending Review -> Human Approval -> Approved -> SDK
serves) exactly: no language is ever considered approved without a real,
attributable per-language approval. The document's top-level
status/approvedBy/approvedAt/rejectedBy/etc. fields are left untouched as a
historical/analytics record (they are already never read for runtime
serving or Translation Memory reuse — see TranslationRepository).

It does NOT retroactively approve any language added to a document AFTER
this migration runs — new languages always start "pending" (see
TranslationRepository.save_translation).

Idempotent: only touches translations.{lang} entries that don't already have
a status field.

Usage:
    python migrations/021_translations_per_language_status.py [--dry-run] [--mongo-uri URI]
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys

_HERE = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_HERE)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

COLLECTION = "translations"


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    from pymongo import AsyncMongoClient

    client: AsyncMongoClient = AsyncMongoClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]
    col = db[COLLECTION]

    # Any document with at least one language missing translations.{lang}.status.
    docs = await col.find({}).to_list(length=None)
    total = len(docs)
    touched = 0

    for doc in docs:
        translations = doc.get("translations") or {}
        doc_status = doc.get("status")

        set_fields: dict = {}
        for lang, entry in translations.items():
            if not isinstance(entry, dict) or "status" in entry:
                continue  # already migrated / already has its own status

            # Always "pending" -- never infer approved/rejected for a
            # language from the document's top-level status. See module
            # docstring: legacy top-level approvals carry no per-language
            # attribution, so defaulting to pending is the only safe choice.
            set_fields[f"translations.{lang}.status"] = "pending"

        if not set_fields:
            continue

        touched += 1
        print(
            f"{'[DRY-RUN] ' if dry_run else ''}Document _id={doc['_id']} "
            f"(doc status={doc_status!r}): {list(set_fields.keys())}"
        )
        if not dry_run:
            await col.update_one({"_id": doc["_id"]}, {"$set": set_fields})

    print(f"\nCollection '{COLLECTION}': {total} total, {touched} document(s) "
          f"{'would be' if dry_run else 'were'} backfilled.")

    await client.close()


def _resolve_mongo_uri(cli_uri: str | None) -> str:
    if cli_uri:
        return cli_uri
    for env_var in ("MONGO_DB_CONNECTION_STRING", "DB_CONNECTION"):
        val = os.environ.get(env_var, "").strip()
        if val:
            return val
    env_path = os.path.join(_PROJECT_ROOT, ".env")
    if os.path.exists(env_path):
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if line.startswith("#") or "=" not in line:
                    continue
                key, _, value = line.partition("=")
                if key.strip() in ("MONGO_DB_CONNECTION_STRING", "DB_CONNECTION"):
                    val = value.strip().strip('"').strip("'")
                    if val:
                        return val
    return "mongodb://localhost:27017/seeds"


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    parser = argparse.ArgumentParser(
        description="Backfill per-language approval status on the translations collection."
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing.")
    parser.add_argument("--mongo-uri", default=None, help="MongoDB connection URI.")
    args = parser.parse_args()

    mongo_uri = _resolve_mongo_uri(args.mongo_uri)
    masked = mongo_uri[:20] + "..." if len(mongo_uri) > 20 else mongo_uri
    print(f"Connecting to: {masked}")
    print(f"Mode: {'DRY-RUN (no writes)' if args.dry_run else 'LIVE (will write)'}\n")

    asyncio.run(migrate(mongo_uri, args.dry_run))


if __name__ == "__main__":
    main()
