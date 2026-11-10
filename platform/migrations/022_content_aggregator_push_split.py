#!/usr/bin/env python3
"""
Migration 022 — Retire Hexis/Iris pull jobs and stamp pushed partner docs.

Pull/push segregation: Subodha keeps the SEEDS-initiated PULL model; Hexis and Iris
become PUSH-only. Two one-time data fixes:

1. Fail any `contentAggregatorSyncJobs` rows stuck in `pending` with
   `source_type` hexis/iris. Their consumers no longer start, and
   `reconcile_interrupted_jobs` only touches claimed/running rows, so without this
   step they would sit pending forever. Error recorded as `pull-retired`.
2. Backfill `source_type` on pushed partner docs in `contentAggregators` that predate
   token-bound stamping (docs with `created_by` but no `source_type`), resolving the
   owning client via `integrationClients.client_id`. Docs whose client is unknown or
   carries no source are reported and left untouched for the operator.

Idempotent and restartable: already-failed jobs and already-stamped docs are skipped.

Deployment order: run after the code change is live, before relying on
`doc["source_type"]` reads for partner docs.

Usage:
    python migrations/022_content_aggregator_push_split.py [--dry-run] [--mongo-uri URI]
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import UTC, datetime

_HERE = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_HERE)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

SYNC_JOBS_COLLECTION = "contentAggregatorSyncJobs"
TREES_COLLECTION = "contentAggregators"
CLIENTS_COLLECTION = "integrationClients"

RETIRED_SOURCES = ("hexis", "iris")


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    from motor.motor_asyncio import AsyncIOMotorClient

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]
    jobs = db[SYNC_JOBS_COLLECTION]
    trees = db[TREES_COLLECTION]
    clients = db[CLIENTS_COLLECTION]
    now = datetime.now(UTC).isoformat()

    stranded = await jobs.find(
        {"status": "pending", "source_type": {"$in": list(RETIRED_SOURCES)}}
    ).to_list(length=None)
    print(f"Sync jobs: {len(stranded)} pending hexis/iris job(s) to retire.\n")
    if stranded and not dry_run:
        result = await jobs.update_many(
            {"status": "pending", "source_type": {"$in": list(RETIRED_SOURCES)}},
            {"$set": {"status": "failed", "finished_at": now, "error": "pull-retired"}},
        )
        print(f"Retired {result.modified_count} job(s).")

    unstamped = await trees.find(
        {"created_by": {"$exists": True}, "source_type": {"$exists": False}}
    ).to_list(length=None)
    print(f"\nPartner docs: {len(unstamped)} doc(s) missing source_type.")
    if unstamped:
        by_client: dict[str, list] = {}
        for doc in unstamped:
            by_client.setdefault(doc["created_by"], []).append(doc)
        client_docs = await clients.find(
            {"client_id": {"$in": list(by_client)}}
        ).to_list(length=None)
        source_by_client = {
            c["client_id"]: c.get("source_type", "") for c in client_docs
        }
        stamped = 0
        for client_id, docs in by_client.items():
            source = source_by_client.get(client_id, "")
            if not source:
                print(f"  SKIP client_id={client_id}: unknown client or empty source ({len(docs)} doc(s))")
                continue
            if dry_run:
                stamped += len(docs)
                continue
            result = await trees.update_many(
                {"created_by": client_id, "source_type": {"$exists": False}},
                {"$set": {"source_type": source, "updated_at": datetime.now(UTC)}},
            )
            stamped += result.modified_count
        print(f"{'Would stamp' if dry_run else 'Stamped'} {stamped} doc(s).")

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
    parser = argparse.ArgumentParser(description="Retire Hexis/Iris pull jobs and stamp pushed partner docs.")
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
