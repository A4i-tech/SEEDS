#!/usr/bin/env python3
"""
Migration 003 — Normalise quizData collection.

Changes per document:
  _id          UUID string → new ObjectId  (old UUID saved as legacy_id)
  tenantId     → tenant_id   value: already ObjectId — kept
  schoolId     → school_id   value: None or ObjectId — kept
  createdBy    → created_by
  isPullModel  → is_pull_model
  isTeacherApp → is_teacher_app
  isDeleted    → is_deleted
  positiveMarks → positive_marks
  negativeMarks → negative_marks
  title.audioUrl  → title.audio_url
  theme.audioUrl  → theme.audio_url
  __v          → removed (Mongoose version key)

  questions[].correct_option_id is already snake_case — no change.

NOTE: content_jobs.content_id references the old UUID _id. Those will need a
      separate migration (004) once this one is applied.

Idempotent: documents whose _id is already an ObjectId are skipped.

Usage:
    python migrations/003_quizdata_objectid_to_string.py [--dry-run] [--mongo-uri URI]
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

COLLECTION = "quizData"

_RENAMES = {
    "tenantId": "tenant_id",
    "schoolId": "school_id",
    "createdBy": "created_by",
    "isPullModel": "is_pull_model",
    "isTeacherApp": "is_teacher_app",
    "isDeleted": "is_deleted",
    "positiveMarks": "positive_marks",
    "negativeMarks": "negative_marks",
}


def _migrate_doc(doc: dict, ObjectId: type) -> tuple[dict, list[str]]:
    changes: list[str] = []
    new_doc = dict(doc)

    # _id: UUID string -> new ObjectId
    old_id = new_doc["_id"]
    new_id = ObjectId()
    new_doc["_id"] = new_id
    changes.append(f"_id: '{old_id}' -> ObjectId({new_id})")

    # Top-level renames + ObjectId coercion for reference fields
    _oid_fields = {"tenant_id", "school_id", "created_by"}
    for old_key, new_key in _RENAMES.items():
        if old_key not in new_doc:
            continue
        val = new_doc.pop(old_key)
        if new_key in _oid_fields and val is not None:
            if isinstance(val, str) and ObjectId.is_valid(val):
                coerced = ObjectId(val)
                changes.append(f"{old_key} -> {new_key}  (value: '{val}' -> ObjectId({coerced}))")
                val = coerced
            else:
                changes.append(f"{old_key} -> {new_key}  (value: {val!r})")
        else:
            changes.append(f"{old_key} -> {new_key}  (value: {val!r})")
        new_doc[new_key] = val

    # Nested: title / theme
    for field in ("title", "theme"):
        sub = new_doc.get(field)
        if isinstance(sub, dict) and "audioUrl" in sub:
            sub["audio_url"] = sub.pop("audioUrl")
            new_doc[field] = sub
            changes.append(f"{field}.audioUrl -> {field}.audio_url")

    # Drop Mongoose version key
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

    # Only docs whose _id is not yet an ObjectId need migration.
    all_docs = await col.find({}).to_list(length=None)
    pending = [d for d in all_docs if not isinstance(d["_id"], ObjectId)]
    total = len(all_docs)

    print(f"Collection '{COLLECTION}': {total} total, {len(pending)} need migration.\n")

    if not pending:
        print("Nothing to migrate — all _id fields are already ObjectId.")
        client.close()
        return

    migrated = 0

    for doc in pending:
        new_doc, changes = _migrate_doc(doc, ObjectId)

        print(f"{'[DRY-RUN] ' if dry_run else ''}Document:")
        for c in changes:
            print(f"  - {c}")
        print()

        if not dry_run:
            await col.insert_one(new_doc)
            await col.delete_one({"_id": doc["_id"]})

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
    parser = argparse.ArgumentParser(description="Normalise quizData collection.")
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
