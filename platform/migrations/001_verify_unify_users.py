#!/usr/bin/env python3
"""
Verification script for Migration 001 — Unify users.

Usage:
    python migrations/001_verify_unify_users.py [--mongo-uri URI]

Checks:
  1. Count check: users.migrated_from docs count >= teachers + students + tenants count.
  2. Sample check: 10 random docs from each source collection must exist in users
     with the correct migrated_from field.

Exits with code 0 on PASS, 1 on FAIL.
"""

from __future__ import annotations

import argparse
import asyncio
import os
import random
import sys
from typing import Any

_HERE = os.path.dirname(os.path.abspath(__file__))
_PROJECT_ROOT = os.path.dirname(_HERE)
if _PROJECT_ROOT not in sys.path:
    sys.path.insert(0, _PROJECT_ROOT)


async def verify(mongo_uri: str) -> bool:
    from motor.motor_asyncio import AsyncIOMotorClient  # noqa: PLC0415

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]
    passed = True
    results: list[str] = []

    sources = ["teachers", "students", "tenants"]

    # --- Count check ---
    src_counts: dict[str, int] = {}
    for src in sources:
        src_counts[src] = await db[src].count_documents({})

    total_src = sum(src_counts.values())
    total_migrated = await db["users"].count_documents({"migrated_from": {"$exists": True}})

    count_pass = total_migrated >= total_src
    results.append(
        f"{'PASS' if count_pass else 'FAIL'} Count check: "
        f"source total={total_src} "
        f"(teachers={src_counts['teachers']}, students={src_counts['students']}, "
        f"tenants={src_counts['tenants']}), "
        f"migrated users={total_migrated}"
    )
    if not count_pass:
        passed = False

    # --- Sample check ---
    for src in sources:
        all_src_docs: list[dict[str, Any]] = await db[src].find({}).to_list(length=None)
        sample_size = min(10, len(all_src_docs))
        sample = random.sample(all_src_docs, sample_size) if all_src_docs else []

        mismatches: list[str] = []
        for doc in sample:
            user_doc = await db["users"].find_one(
                {"_id": doc["_id"], "migrated_from": src}
            )
            if user_doc is None:
                mismatches.append(str(doc["_id"]))

        if mismatches:
            passed = False
            results.append(
                f"FAIL Sample check ({src}): "
                f"{len(mismatches)} of {sample_size} sampled docs missing from users: "
                f"{', '.join(mismatches[:5])}"
            )
        else:
            results.append(
                f"PASS Sample check ({src}): "
                f"{sample_size} sampled docs found in users collection."
            )

    # --- Report ---
    print("\n=== Migration 001 Verification Report ===")
    for line in results:
        print(f"  {line}")

    overall = "PASS" if passed else "FAIL"
    print(f"\nOverall: {overall}")
    print("=========================================\n")

    client.close()
    return passed


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
    parser = argparse.ArgumentParser(description="Verify migration 001 — unify users.")
    parser.add_argument("--mongo-uri", default=None, help="MongoDB connection URI.")
    args = parser.parse_args()

    mongo_uri = _resolve_mongo_uri(args.mongo_uri)
    ok = asyncio.run(verify(mongo_uri))
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
