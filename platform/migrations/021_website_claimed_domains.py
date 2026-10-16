#!/usr/bin/env python3
"""
Migration 021 — Backfill websites.claimed_domains and enforce unique domain claims.

claimed_domains = [domain, *additional_domains], normalized (trimmed, lowercased,
deduplicated). The unique partial index `claimed_domains_unique` makes MongoDB
reject two websites claiming the same hostname in any combination of the primary
`domain` and `additional_domains`.

Deployment order:
    1. Deploy the application version that writes claimed_domains to every instance
       (older instances create websites without it, which bypasses the index).
    2. Run this migration (--dry-run first).
    3. Re-run it once; it must report 0 websites without claimed_domains.

Steps:
    1. Read every website and compute its normalized claims.
    2. If any hostname is claimed by more than one website, print each hostname with
       its site_ids and stop. Nothing is written, deleted or rewritten; resolve the
       duplicates manually and re-run.
    3. Create the website indexes (including the unique claimed_domains index) before
       backfilling, so concurrent writes are already guarded while documents are updated.
    4. Backfill claimed_domains per document with a compare-and-set on the fields it was
       computed from, retrying when a concurrent update changed them.

Idempotent: documents whose claimed_domains already match are not touched. Safe to
re-run after a failure or interruption.

Usage:
    python migrations/021_website_claimed_domains.py [--dry-run] [--mongo-uri URI]
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from typing import Any

_HERE = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_HERE)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)

COLLECTION = "websites"
MAX_ATTEMPTS = 5


def _claims(doc: dict[str, Any]) -> list[str]:
    raw = [doc.get("domain"), *(doc.get("additional_domains") or [])]
    normalized = (value.strip().lower() for value in raw if isinstance(value, str))
    return list(dict.fromkeys(value for value in normalized if value))


def find_duplicate_claims(docs: list[dict[str, Any]]) -> dict[str, list[str]]:
    owners: dict[str, set[str]] = {}
    for doc in docs:
        for domain in _claims(doc):
            owners.setdefault(domain, set()).add(str(doc.get("site_id") or doc["_id"]))
    return {domain: sorted(sites) for domain, sites in sorted(owners.items()) if len(sites) > 1}


def _is_current(doc: dict[str, Any]) -> bool:
    return "claimed_domains" in doc and sorted(doc["claimed_domains"]) == sorted(_claims(doc))


def _guard(doc: dict[str, Any]) -> dict[str, Any]:
    additional = doc.get("additional_domains", {"$exists": False})
    return {"_id": doc["_id"], "domain": doc.get("domain"), "additional_domains": additional}


async def run(db: Any, dry_run: bool) -> dict[str, Any]:
    from pymongo.errors import DuplicateKeyError

    from app.repositories.website_repository import WebsiteRepository

    col = db[COLLECTION]
    docs = await col.find({}).to_list(length=None)
    result: dict[str, Any] = {
        "total": len(docs),
        "duplicates": find_duplicate_claims(docs),
        "backfilled": 0,
        "conflicts": [],
        "remaining": 0,
    }

    if result["duplicates"]:
        print("Duplicate domain claims found; nothing was written:")
        for domain, sites in result["duplicates"].items():
            print(f"  {domain} -> site_ids {sites}")
        return result

    stale = [doc for doc in docs if not _is_current(doc)]
    print(f"{len(docs)} website(s), {len(stale)} need claimed_domains backfilled.")
    if dry_run:
        print(f"[DRY-RUN] {len(stale)} document(s) would be updated; no indexes created.")
        result["remaining"] = len(stale)
        return result

    await WebsiteRepository.ensure_indexes(db)

    for doc in stale:
        for _ in range(MAX_ATTEMPTS):
            try:
                updated = await col.update_one(_guard(doc), {"$set": {"claimed_domains": _claims(doc)}})
            except DuplicateKeyError as exc:
                result["conflicts"].append({"site_id": doc.get("site_id"), "error": str(exc)})
                break
            if updated.matched_count:
                result["backfilled"] += 1
                break
            doc = await col.find_one({"_id": doc["_id"]})
            if doc is None or _is_current(doc):
                break
        else:
            result["conflicts"].append({"site_id": doc.get("site_id"), "error": "changed concurrently, re-run"})

    result["remaining"] = await col.count_documents({"claimed_domains": {"$exists": False}})
    print(f"Backfilled {result['backfilled']} document(s).")
    for conflict in result["conflicts"]:
        print(f"  CONFLICT site_id={conflict['site_id']}: {conflict['error']}")
    print(f"Websites without claimed_domains: {result['remaining']}")
    return result


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    from pymongo import AsyncMongoClient

    client: AsyncMongoClient = AsyncMongoClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    try:
        result = await run(client[db_name], dry_run)
    finally:
        await client.close()

    if result["duplicates"] or result["conflicts"] or (not dry_run and result["remaining"]):
        sys.exit(1)


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
    parser = argparse.ArgumentParser(description="Backfill websites.claimed_domains and create its unique index.")
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
