#!/usr/bin/env python3
"""
Migration 001 — Unify teachers, students, and tenants into the users collection.

Usage:
    python migrations/001_unify_users.py [--dry-run] [--mongo-uri URI]

Flags:
    --dry-run     Print what would be migrated without writing to MongoDB.
    --mongo-uri   MongoDB connection string (default: reads MONGO_DB_CONNECTION_STRING
                  or DB_CONNECTION from environment / .env file).

Idempotent:
    Documents that already have a 'migrated_from' field are skipped so
    the script is safe to run multiple times.

Field renames applied:
    phoneNumber  → phone
    tenantName   → tenant_name
    schoolId     → school_id
    password     → hashed_password  (legacy stored bcrypt hash under "password")

Traceability:
    Each migrated document receives:
        role          = preserved from source doc, or default "teacher" | "student" | "tenant"
        migrated_from = "teachers" | "students" | "tenants"
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


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    """Main migration coroutine."""
    from motor.motor_asyncio import AsyncIOMotorClient  # noqa: PLC0415

    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        # Infer DB name from URI or fall back to "seeds"
        db_name = client.get_default_database().name if "/" in mongo_uri.rsplit("?", 1)[0] else "seeds"
    except Exception:
        db_name = "seeds"

    db = client[db_name]

    sources: list[tuple[str, str]] = [
        ("teachers", "teacher"),
        ("students", "student"),
        ("tenants", "tenant"),
    ]

    totals: dict[str, int] = {}

    for collection_name, role in sources:
        src_col = db[collection_name]
        dst_col = db["users"]

        # Only migrate docs that haven't been migrated yet.
        cursor = src_col.find({"migrated_from": {"$exists": False}})
        docs: list[dict[str, Any]] = await cursor.to_list(length=None)

        migrated = 0
        skipped = 0

        for doc in docs:
            # Build the destination document.
            new_doc: dict[str, Any] = dict(doc)
            new_doc["role"] = role
            new_doc["migrated_from"] = collection_name

            # Normalise legacy field names to unified schema.
            if "phoneNumber" in new_doc and "phone" not in new_doc:
                new_doc["phone"] = new_doc.pop("phoneNumber")
            if "tenantName" in new_doc and "tenant_name" not in new_doc:
                new_doc["tenant_name"] = new_doc.pop("tenantName")
            if "schoolId" in new_doc and "school_id" not in new_doc:
                new_doc["school_id"] = str(new_doc.pop("schoolId"))
            # Rename plain-text password field to hashed_password (legacy stored bcrypt hash as "password").
            if "password" in new_doc and "hashed_password" not in new_doc:
                new_doc["hashed_password"] = new_doc.pop("password")
            # Ensure name is always populated — legacy tenants had no name field, only tenantName.
            if not new_doc.get("name"):
                new_doc["name"] = new_doc.get("tenant_name") or new_doc.get("phone") or str(new_doc["_id"])
            # Preserve sub-roles (e.g. "content_creator") — only set default if doc has no role.
            new_doc["role"] = doc.get("role") or role

            existing = await dst_col.find_one(
                {"migrated_from": collection_name, "_id": doc["_id"]}
            )
            if existing is not None:
                skipped += 1
                continue

            if dry_run:
                print(
                    f"[DRY-RUN] Would migrate {collection_name}/{doc['_id']} "
                    f"→ users (role={role})"
                )
            else:
                await dst_col.replace_one(
                    {"_id": doc["_id"]},
                    new_doc,
                    upsert=True,
                )
            migrated += 1

        totals[collection_name] = migrated
        print(
            f"{'[DRY-RUN] ' if dry_run else ''}"
            f"{collection_name}: {migrated} document(s) migrated, "
            f"{skipped} already present (skipped)."
        )

    total = sum(totals.values())
    print(
        f"\n{'[DRY-RUN] ' if dry_run else ''}"
        f"Migration complete — {total} document(s) total "
        f"({'no writes performed' if dry_run else 'written to users collection'})."
    )

    client.close()


def _resolve_mongo_uri(cli_uri: str | None) -> str:
    """Return the best-available MongoDB connection string."""
    if cli_uri:
        return cli_uri
    for env_var in ("MONGO_DB_CONNECTION_STRING", "DB_CONNECTION"):
        val = os.environ.get(env_var, "").strip()
        if val:
            return val

    # Try loading from .env in project root.
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
        description="Migrate teachers/students/tenants → unified users collection."
    )
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
