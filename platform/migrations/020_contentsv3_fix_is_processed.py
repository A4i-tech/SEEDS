#!/usr/bin/env python3
"""
Migration 020 — Fix is_processed on contentsV3 docs that already have processed audio.

Legacy docs have real generated audio (audio_content[].audio_url pointing at
output-container, with duration_seconds set) but is_processed is false/missing,
so ContentDetails.js shows "Content is being processed, try again later!" for
content that finished processing long ago.

Idempotent: only touches docs matching the processed-audio signature whose
is_processed isn't already true.

Usage:
    python migrations/020_contentsv3_fix_is_processed.py [--dry-run] [--mongo-uri URI]
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

_PROCESSED_AUDIO_FILTER = {
    "is_processed": {"$ne": True},
    "audio_content": {
        "$elemMatch": {
            "audio_url": {"$regex": "output-container"},
            "duration_seconds": {"$exists": True, "$ne": None},
        }
    },
}


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    from pymongo import AsyncMongoClient

    client: AsyncMongoClient = AsyncMongoClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]
    col = db[COLLECTION]

    pending = await col.find(_PROCESSED_AUDIO_FILTER).to_list(length=None)
    total = await col.count_documents({})
    print(f"Collection '{COLLECTION}': {total} total, {len(pending)} need is_processed fixed.\n")

    if not pending:
        print("Nothing to fix.")
        await client.close()
        return

    for doc in pending:
        title = (doc.get("title") or {}).get("english", "")
        print(f"{'[DRY-RUN] ' if dry_run else ''}Document _id={doc['_id']} title={title!r}: is_processed -> True")

    if not dry_run:
        result = await col.update_many(_PROCESSED_AUDIO_FILTER, {"$set": {"is_processed": True}})
        print(f"\n{result.modified_count} document(s) fixed.")
    else:
        print(f"\n[DRY-RUN] {len(pending)} document(s) would be fixed.")

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
    parser = argparse.ArgumentParser(description="Fix is_processed on contentsV3 docs with real processed audio.")
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
