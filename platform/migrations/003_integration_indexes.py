#!/usr/bin/env python3
"""
Migration 003 — Content Aggregator integration indexes (#458).

Adds the indexes the partner-auth token endpoint (POST /v1/auth/token) relies on:

    integrationClients:
        {client_id: 1}  (unique)     — every token request looks up by client_id
    integrationTokens:
        {token_id: 1}   (unique)     — refresh-token lookup; prevents collisions
        {expires_at: 1} (TTL, expireAfterSeconds=0) — expired refresh tokens
                                        self-delete instead of growing forever

Usage:
    python migrations/003_integration_indexes.py [--dry-run] [--mongo-uri URI]

Flags:
    --dry-run     Print the index create commands without executing them.
    --mongo-uri   MongoDB connection string (default: reads MONGO_DB_CONNECTION_STRING
                  or DB_CONNECTION from environment / .env file).

Idempotency:
    MongoDB's createIndex is idempotent — re-running this script for indexes
    that already exist is safe and produces no errors.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Any

# ---------------------------------------------------------------------------
# Allow running from project root without installing the package.
# ---------------------------------------------------------------------------
_HERE = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_HERE)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

# ---------------------------------------------------------------------------
# Index specification: (collection_name, key_spec, options)
# ---------------------------------------------------------------------------
# key_spec is a list of (field, direction) tuples — direction 1=ASC, -1=DESC.
# options is a dict of additional createIndex options (e.g. unique=True,
# expireAfterSeconds for TTL indexes).
# ---------------------------------------------------------------------------

INDEX_SPECS: list[tuple[str, list[tuple[str, int]], dict[str, Any]]] = [
    # integrationClients — partner credential lookup
    ("integrationClients", [("client_id", 1)], {"unique": True}),
    # integrationTokens — refresh-token lookup + TTL cleanup
    ("integrationTokens", [("token_id", 1)], {"unique": True}),
    ("integrationTokens", [("expires_at", 1)], {"expireAfterSeconds": 0}),
]


def _describe_index(collection: str, key_spec: list[tuple[str, int]], options: dict[str, Any]) -> str:
    """Return a human-readable description of an index create command."""
    fields = ", ".join(f"{f}: {d}" for f, d in key_spec)
    opts = ", ".join(f"{k}={v}" for k, v in options.items()) if options else ""
    suffix = f" [{opts}]" if opts else ""
    return f"db[{collection!r}].create_index([{fields}]{suffix})"


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    """Create all Content Aggregator integration indexes."""
    from motor.motor_asyncio import AsyncIOMotorClient  # noqa: PLC0415
    from pymongo import ASCENDING, DESCENDING  # noqa: PLC0415

    direction_map = {1: ASCENDING, -1: DESCENDING}

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]

    created = 0
    for collection_name, key_spec, options in INDEX_SPECS:
        pymongo_keys = [(field, direction_map[direction]) for field, direction in key_spec]
        description = _describe_index(collection_name, key_spec, options)

        if dry_run:
            print(f"[DRY-RUN] {description}")
        else:
            try:
                col = db[collection_name]
                index_name = await col.create_index(pymongo_keys, **options)
                print(f"  Created: {collection_name} → {index_name}")
                created += 1
            except Exception as exc:
                print(f"  ERROR: {collection_name} index failed — {exc}")
                client.close()
                sys.exit(1)

    if dry_run:
        print(f"\n[DRY-RUN] {len(INDEX_SPECS)} index command(s) would be executed (no writes performed).")
    else:
        print(f"\nMigration complete — {created}/{len(INDEX_SPECS)} index(es) created/verified.")

    client.close()


def _resolve_mongo_uri(cli_uri: str | None) -> str:
    """Return the best-available MongoDB connection string."""
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
        description="Add Content Aggregator integration indexes (#458)."
    )
    parser.add_argument("--dry-run", action="store_true", help="Preview index commands without writing.")
    parser.add_argument("--mongo-uri", default=None, help="MongoDB connection URI.")
    args = parser.parse_args()

    mongo_uri = _resolve_mongo_uri(args.mongo_uri)
    masked = mongo_uri[:20] + "..." if len(mongo_uri) > 20 else mongo_uri
    print(f"Connecting to: {masked}")
    print(f"Mode: {'DRY-RUN (no writes)' if args.dry_run else 'LIVE (will create indexes)'}\n")

    asyncio.run(migrate(mongo_uri, args.dry_run))


if __name__ == "__main__":
    main()
