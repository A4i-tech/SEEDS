#!/usr/bin/env python3
"""
Migration 019 — Remove stray type:"quiz" documents from contentsV3.

Quizzes belong exclusively in the quizData collection (QuizContent /
QuizRepository). A handful of quiz-shaped docs (positive_marks, questions,
etc.) previously leaked into contentsV3 via POST /content instead of
POST /content/quiz — that write path now rejects type:"quiz" outright
(ContentCreateRequest._reject_quiz_type), so this is a one-time cleanup of
pre-existing stray docs, not an ongoing condition.

Run migration 018 (type lowercasing) first — this matches on the exact
lowercase string "quiz".

Usage:
    python migrations/019_contentsv3_remove_quiz_docs.py [--dry-run] [--mongo-uri URI]
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

    stray = await col.find({"type": "quiz"}).to_list(length=None)
    total = await col.count_documents({})
    print(f"Collection '{COLLECTION}': {total} total, {len(stray)} stray type:\"quiz\" doc(s) found.\n")

    if not stray:
        print("Nothing to remove.")
        await client.close()
        return

    for doc in stray:
        print(f"{'[DRY-RUN] ' if dry_run else ''}Deleting _id={doc['_id']} title={doc.get('title')!r} is_deleted={doc.get('is_deleted')}")

    if not dry_run:
        result = await col.delete_many({"type": "quiz"})
        print(f"\n{result.deleted_count} document(s) deleted.")
    else:
        print(f"\n[DRY-RUN] {len(stray)} document(s) would be deleted.")

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
    parser = argparse.ArgumentParser(description="Remove stray type:\"quiz\" docs from contentsV3.")
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
