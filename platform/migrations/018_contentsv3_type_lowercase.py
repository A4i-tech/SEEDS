#!/usr/bin/env python3
"""
Migration 018 — Lowercase contentsV3.type.

Legacy writes stored `type` with mixed casing (Story/Song/Poem alongside
story/song/poem). AudioContent.type is now a Pydantic Literal discriminator
(story/song/poem/snippet) used to pick between AudioContent and QuizContent
in FastAPI response serialization — any casing outside that exact literal set
fails response validation with a 500.

Idempotent: only touches docs whose `type` isn't already lowercase.

Usage:
    python migrations/018_contentsv3_type_lowercase.py [--dry-run] [--mongo-uri URI]
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
    from pymongo import AsyncMongoClient

    client: AsyncMongoClient = AsyncMongoClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]
    col = db[COLLECTION]

    pending = await col.find({"type": {"$exists": True}}).to_list(length=None)
    to_fix = [doc for doc in pending if isinstance(doc.get("type"), str) and doc["type"] != doc["type"].lower()]

    total = await col.count_documents({})
    print(f"Collection '{COLLECTION}': {total} total, {len(to_fix)} need type lowercasing.\n")

    if not to_fix:
        print("Nothing to fix.")
        await client.close()
        return

    for doc in to_fix:
        old, new = doc["type"], doc["type"].lower()
        print(f"{'[DRY-RUN] ' if dry_run else ''}Document _id={doc['_id']}: type '{old}' -> '{new}'")
        if not dry_run:
            await col.update_one({"_id": doc["_id"]}, {"$set": {"type": new}})

    print(
        f"\n{'[DRY-RUN] ' if dry_run else ''}"
        f"{len(to_fix)} document(s) {'would be' if dry_run else ''} fixed."
    )
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
    parser = argparse.ArgumentParser(description="Lowercase contentsV3.type values.")
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
