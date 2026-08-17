#!/usr/bin/env python3
"""
Migration 005 — Normalise contentsV3 collection field names.

Changes:
  tenantId      -> tenant_id   value: ObjectId (kept)
  schoolId      -> school_id   value: string -> ObjectId where valid
  createdBy     -> created_by
  isPullModel   -> is_pull_model
  isTeacherApp  -> is_teacher_app
  isDeleted     -> is_deleted
  isProcessed   -> is_processed
  audioContent  -> audio_content  +  each element's audioUrl -> audio_url
  title.audioUrl  -> title.audio_url
  theme.audioUrl  -> theme.audio_url
  __v           -> removed

Idempotent: documents without 'tenantId' are already migrated and skipped.

Usage:
    python migrations/005_contentsv3_snake_case.py [--dry-run] [--mongo-uri URI]
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

COLLECTION = "contentsV3"

_TOP_RENAMES = {
    "tenantId": "tenant_id",
    "schoolId": "school_id",
    "createdBy": "created_by",
    "isPullModel": "is_pull_model",
    "isTeacherApp": "is_teacher_app",
    "isDeleted": "is_deleted",
    "isProcessed": "is_processed",
}
_OID_FIELDS = {"school_id"}   # tenant_id is already ObjectId — kept as-is


def _rename_audio_content(items: list) -> list:
    out = []
    for item in items:
        if not isinstance(item, dict):
            out.append(item)
            continue
        entry = dict(item)
        if "audioUrl" in entry:
            entry["audio_url"] = entry.pop("audioUrl")
        if "durationSeconds" in entry:
            entry["duration_seconds"] = entry.pop("durationSeconds")
        out.append(entry)
    return out


def _rename_text_block(obj: dict) -> dict:
    if not isinstance(obj, dict):
        return obj
    out = dict(obj)
    if "audioUrl" in out:
        out["audio_url"] = out.pop("audioUrl")
    return out


def _migrate_doc(doc: dict, ObjectId: type) -> tuple[dict, list[str]]:
    changes: list[str] = []
    new_doc = dict(doc)

    # Top-level field renames + OID coercion
    for old, new in _TOP_RENAMES.items():
        if old not in new_doc:
            continue
        val = new_doc.pop(old)
        if new in _OID_FIELDS and isinstance(val, str) and ObjectId.is_valid(val):
            coerced = ObjectId(val)
            changes.append(f"{old} -> {new}  ('{val}' -> ObjectId)")
            val = coerced
        else:
            changes.append(f"{old} -> {new}  ({val!r})")
        new_doc[new] = val

    # audioContent array: rename + audio_url inside each element
    if "audioContent" in new_doc:
        transformed = _rename_audio_content(new_doc.pop("audioContent"))
        new_doc["audio_content"] = transformed
        changes.append(f"audioContent -> audio_content  ({len(transformed)} items, audioUrl -> audio_url)")

    # Nested title / theme
    for field in ("title", "theme"):
        if isinstance(new_doc.get(field), dict) and "audioUrl" in new_doc[field]:
            new_doc[field] = _rename_text_block(new_doc[field])
            changes.append(f"{field}.audioUrl -> {field}.audio_url")

    # Drop Mongoose key
    if "__v" in new_doc:
        changes.append(f"__v: {new_doc.pop('__v')} -> removed")

    return new_doc, changes


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    from bson import ObjectId
    from motor.motor_asyncio import AsyncIOMotorClient

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]
    col = db[COLLECTION]

    pending = await col.find({"tenantId": {"$exists": True}}).to_list(length=None)
    total = await col.count_documents({})

    print(f"Collection '{COLLECTION}': {total} total, {len(pending)} need migration.\n")

    if not pending:
        print("Nothing to migrate.")
        client.close()
        return

    migrated = 0
    for doc in pending:
        new_doc, changes = _migrate_doc(doc, ObjectId)

        print(f"{'[DRY-RUN] ' if dry_run else ''}Document _id={doc['_id']}:")
        for c in changes:
            print(f"  - {c}")
        print()

        if not dry_run:
            await col.replace_one({"_id": doc["_id"]}, new_doc)

        migrated += 1

    print(
        f"{'[DRY-RUN] ' if dry_run else ''}"
        f"{migrated} document(s) {'would be' if dry_run else ''} migrated."
    )
    client.close()


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
    parser = argparse.ArgumentParser(description="Normalise contentsV3 collection.")
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
