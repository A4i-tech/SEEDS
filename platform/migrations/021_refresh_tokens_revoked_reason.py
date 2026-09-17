#!/usr/bin/env python3
"""
Migration 021 — Backfill revoked_reason on userRefreshTokens docs.

The revoked_reason field distinguishes why a refresh token was revoked:
"logout" (explicit user logout, exempt from the reuse alarm) vs "consumed"
(normal rotation, or force-revoked as part of reuse-cascade — both must
still trigger the reuse alarm on replay).

Legacy revoked=True docs predate this field and have no reliable record of
which case they were. Backfilling them as "logout" would be unsafe: any
future replay of a pre-migration revoked token would then be silently
treated as harmless logout and skip the reuse alarm, weakening detection.
So they are backfilled as "consumed" — the secure default that preserves
existing reuse-detection behavior for every historical token.

Idempotent: only touches revoked docs missing revoked_reason.

Usage:
    python migrations/021_refresh_tokens_revoked_reason.py [--dry-run] [--mongo-uri URI]
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

COLLECTION = "userRefreshTokens"

_REVOKED_MISSING_REASON_FILTER = {
    "revoked": True,
    "revoked_reason": {"$exists": False},
}

_ACTIVE_MISSING_REASON_FILTER = {
    "revoked": False,
    "revoked_reason": {"$exists": False},
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

    total = await col.count_documents({})
    revoked_pending = await col.count_documents(_REVOKED_MISSING_REASON_FILTER)
    active_pending = await col.count_documents(_ACTIVE_MISSING_REASON_FILTER)
    print(
        f"Collection '{COLLECTION}': {total} total, "
        f"{revoked_pending} revoked doc(s) need revoked_reason='consumed', "
        f"{active_pending} active doc(s) need revoked_reason=None.\n"
    )

    if not revoked_pending and not active_pending:
        print("Nothing to fix.")
        await client.close()
        return

    if not dry_run:
        revoked_result = await col.update_many(
            _REVOKED_MISSING_REASON_FILTER, {"$set": {"revoked_reason": "consumed"}}
        )
        active_result = await col.update_many(
            _ACTIVE_MISSING_REASON_FILTER, {"$set": {"revoked_reason": None}}
        )
        print(f"{revoked_result.modified_count} revoked document(s) backfilled with revoked_reason='consumed'.")
        print(f"{active_result.modified_count} active document(s) backfilled with revoked_reason=None.")
    else:
        print(f"[DRY-RUN] {revoked_pending} revoked document(s) would be backfilled with revoked_reason='consumed'.")
        print(f"[DRY-RUN] {active_pending} active document(s) would be backfilled with revoked_reason=None.")

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
    parser = argparse.ArgumentParser(description="Backfill revoked_reason on userRefreshTokens docs.")
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
