#!/usr/bin/env python3
"""
Rollback script for Migration 001 — Remove migrated users from users collection.

Usage:
    python migrations/001_rollback_unify_users.py [--dry-run] [--mongo-uri URI]

Safety:
    Only removes documents that have a 'migrated_from' field (i.e. those
    inserted by 001_unify_users.py).  Users created directly by the new
    platform (without migrated_from) are NOT touched.

Exits with code 0 on success, 1 on failure.
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


async def rollback(mongo_uri: str, dry_run: bool) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient  # noqa: PLC0415

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]

    # Count docs to be removed (those with migrated_from field).
    filter_query = {"migrated_from": {"$exists": True}}
    count = await db["users"].count_documents(filter_query)

    print(
        f"{'[DRY-RUN] ' if dry_run else ''}"
        f"Found {count} migrated user document(s) to remove."
    )

    if count == 0:
        print("Nothing to rollback.")
        client.close()
        return

    if dry_run:
        # Show a sample of what would be removed.
        sample = await db["users"].find(filter_query).limit(5).to_list(length=5)
        for doc in sample:
            print(
                f"  [DRY-RUN] Would remove user _id={doc['_id']} "
                f"migrated_from={doc.get('migrated_from')}"
            )
        if count > 5:
            print(f"  [DRY-RUN] ... and {count - 5} more.")
        print(f"\n[DRY-RUN] No documents deleted (dry-run mode).")
    else:
        result = await db["users"].delete_many(filter_query)
        print(f"Rollback complete — {result.deleted_count} document(s) removed from users.")

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
                key = key.strip()
                if key in ("MONGO_DB_CONNECTION_STRING", "DB_CONNECTION"):
                    val = value.strip().strip('"').strip("'")
                    if val:
                        return val
    return "mongodb://localhost:27017/seeds"


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rollback migration 001 — remove migrated user documents."
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview changes without writing.")
    parser.add_argument("--mongo-uri", default=None, help="MongoDB connection URI.")
    args = parser.parse_args()

    mongo_uri = _resolve_mongo_uri(args.mongo_uri)
    masked = mongo_uri[:20] + "..." if len(mongo_uri) > 20 else mongo_uri
    print(f"Connecting to: {masked}")
    print(f"Mode: {'DRY-RUN (no writes)' if args.dry_run else 'LIVE (will delete)'}\n")

    asyncio.run(rollback(mongo_uri, args.dry_run))


if __name__ == "__main__":
    main()
