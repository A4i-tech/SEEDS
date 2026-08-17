#!/usr/bin/env python3
"""
Migration 005b — Rename durationSeconds -> duration_seconds inside audio_content items.

Fixes the gap from 005 which missed this nested field.
Idempotent: skips documents whose audio_content items have no durationSeconds.

Usage:
    python migrations/005b_contentsv3_duration_seconds.py [--dry-run] [--mongo-uri URI]
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


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]
    col = db[COLLECTION]

    # Find docs whose audio_content array contains any item with durationSeconds
    pending = await col.find(
        {"audio_content": {"$elemMatch": {"durationSeconds": {"$exists": True}}}}
    ).to_list(length=None)

    total = await col.count_documents({})
    print(f"Collection '{COLLECTION}': {total} total, {len(pending)} need fix.\n")

    if not pending:
        print("Nothing to fix.")
        client.close()
        return

    migrated = 0
    for doc in pending:
        new_items = []
        changed = False
        for item in doc.get("audio_content", []):
            if not isinstance(item, dict):
                new_items.append(item)
                continue
            entry = dict(item)
            if "durationSeconds" in entry:
                entry["duration_seconds"] = entry.pop("durationSeconds")
                changed = True
            new_items.append(entry)

        if not changed:
            continue

        print(f"{'[DRY-RUN] ' if dry_run else ''}Document _id={doc['_id']}: durationSeconds -> duration_seconds in {len(new_items)} audio_content item(s)")

        if not dry_run:
            await col.update_one({"_id": doc["_id"]}, {"$set": {"audio_content": new_items}})

        migrated += 1

    print(
        f"\n{'[DRY-RUN] ' if dry_run else ''}"
        f"{migrated} document(s) {'would be' if dry_run else ''} fixed."
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
    parser = argparse.ArgumentParser(description="Fix durationSeconds in contentsV3 audio_content items.")
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
