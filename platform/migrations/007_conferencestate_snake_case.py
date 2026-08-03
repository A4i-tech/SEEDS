#!/usr/bin/env python3
"""
Migration 007 — Normalise conferenceState collection field names.

Changes:
  teacherPhone  -> teacher_phone
  leaderPhone   -> leader_phone
  isRunning     -> is_running
  createdAt     -> created_at
  actionHistory -> action_history

Idempotent: documents without 'teacherPhone' are already migrated and skipped.

Usage:
    python migrations/007_conferencestate_snake_case.py [--dry-run] [--mongo-uri URI]
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

COLLECTION = "conferenceState"

_RENAMES = {
    "teacherPhone": "teacher_phone",
    "leaderPhone": "leader_phone",
    "isRunning": "is_running",
    "createdAt": "created_at",
    "actionHistory": "action_history",
}


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]
    col = db[COLLECTION]

    pending = await col.find({"teacherPhone": {"$exists": True}}).to_list(length=None)
    total = await col.count_documents({})

    print(f"Collection '{COLLECTION}': {total} total, {len(pending)} need migration.\n")

    if not pending:
        print("Nothing to migrate.")
        client.close()
        return

    migrated = 0
    for doc in pending:
        renames = {old: new for old, new in _RENAMES.items() if old in doc}
        changes = [f"{old} -> {new}  ({doc[old]!r})" for old, new in renames.items()]

        if not renames:
            continue

        print(f"{'[DRY-RUN] ' if dry_run else ''}Document _id={doc['_id']}:")
        for c in changes:
            print(f"  - {c}")
        print()

        if not dry_run:
            await col.update_one({"_id": doc["_id"]}, {"$rename": renames})

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
    parser = argparse.ArgumentParser(description="Normalise conferenceState collection.")
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
