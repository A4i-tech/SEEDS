#!/usr/bin/env python3
"""
Migration 004 — Normalise users collection field names.

Changes:
  isActive   → is_active
  createdAt  → created_at  (if created_at already exists, drop createdAt)
  updatedAt  → updated_at  (if updated_at already exists, drop updatedAt)
  __v        → removed

Idempotent: documents with none of the above camelCase fields are skipped.

Usage:
    python migrations/004_users_snake_case_fields.py [--dry-run] [--mongo-uri URI]
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

COLLECTION = "users"
_CAMEL_FIELDS = {"isActive", "createdAt", "updatedAt", "__v"}


def _build_ops(doc: dict) -> tuple[dict, list[str]]:
    """Return (mongo_update_op, changes) for a single document."""
    renames = {}
    unsets = {}
    changes = []

    if "isActive" in doc:
        renames["isActive"] = "is_active"
        changes.append(f"isActive -> is_active  (value: {doc['isActive']!r})")

    for camel, snake in (("createdAt", "created_at"), ("updatedAt", "updated_at")):
        if camel in doc:
            if snake in doc:
                # snake_case version already exists — just drop the camelCase duplicate
                unsets[camel] = ""
                changes.append(f"{camel} -> dropped (kept existing {snake}: {doc[snake]!r})")
            else:
                renames[camel] = snake
                changes.append(f"{camel} -> {snake}  (value: {doc[camel]!r})")

    if "__v" in doc:
        unsets["__v"] = ""
        changes.append(f"__v: {doc['__v']} -> removed")

    op: dict = {}
    if renames:
        op["$rename"] = renames
    if unsets:
        op["$unset"] = unsets

    return op, changes


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]
    col = db[COLLECTION]

    # Only docs that still have at least one camelCase field need migration.
    pending = await col.find(
        {"$or": [{f: {"$exists": True}} for f in _CAMEL_FIELDS]}
    ).to_list(length=None)
    total = await col.count_documents({})

    print(f"Collection '{COLLECTION}': {total} total, {len(pending)} need migration.\n")

    if not pending:
        print("Nothing to migrate.")
        client.close()
        return

    migrated = 0
    for doc in pending:
        op, changes = _build_ops(doc)
        if not op:
            continue

        print(f"{'[DRY-RUN] ' if dry_run else ''}Document _id={doc['_id']}:")
        for c in changes:
            print(f"  - {c}")
        print()

        if not dry_run:
            await col.update_one({"_id": doc["_id"]}, op)

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
    parser = argparse.ArgumentParser(description="Normalise users collection field names.")
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
