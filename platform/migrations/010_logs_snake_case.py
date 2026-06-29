#!/usr/bin/env python3
"""
Migration 010 — Normalise logs collection field names.

Changes:
  logText -> log_text
  __v     -> removed

Idempotent: documents without 'logText' are already migrated and skipped.

Usage:
    python migrations/010_logs_snake_case.py [--dry-run] [--mongo-uri URI]
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

COLLECTION = "logs"

_CAMEL_FIELDS = {"logText", "__v"}


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]
    col = db[COLLECTION]

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
        renames = {"logText": "log_text"} if "logText" in doc else {}
        unsets = {"__v": ""} if "__v" in doc else {}
        changes = []
        if renames:
            changes.append(f"logText -> log_text  ({str(doc['logText'])[:60]!r})")
        if unsets:
            changes.append(f"__v: {doc['__v']} -> removed")

        op: dict = {}
        if renames:
            op["$rename"] = renames
        if unsets:
            op["$unset"] = unsets

        if not op:
            continue

        if not dry_run:
            await col.update_one({"_id": doc["_id"]}, op)

        migrated += 1

    # Don't print per-doc for 120k docs — just the summary
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
    parser = argparse.ArgumentParser(description="Normalise logs collection.")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--mongo-uri", default=None)
    args = parser.parse_args()

    mongo_uri = _resolve_mongo_uri(args.mongo_uri)
    masked = mongo_uri[:20] + "..." if len(mongo_uri) > 20 else mongo_uri
    print(f"Connecting to: {masked}")
    print(f"Mode: {'DRY-RUN (no writes)' if args.dry_run else 'LIVE (will write)'}\n")

    asyncio.run(migrate(mongo_uri, args.dry_run))


if __name__ == "__main__":
    main()
