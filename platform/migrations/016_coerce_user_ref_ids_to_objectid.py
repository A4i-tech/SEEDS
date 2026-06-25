#!/usr/bin/env python3
"""Migration 016 — users: coerce string school_id / tenant_id to ObjectId.

Some user documents were carried over from legacy collections with school_id
and/or tenant_id stored as plain strings instead of ObjectId refs. This causes
queries that compare against ObjectId values to miss those documents.

Idempotent: only documents with string ids are touched; re-running is safe.
"""
from __future__ import annotations

import sys

from bson import ObjectId
from bson.errors import InvalidId
from motor.motor_asyncio import AsyncIOMotorClient


def _try_oid(val: object) -> ObjectId | None:
    if isinstance(val, ObjectId):
        return None  # already correct
    if isinstance(val, str) and val:
        try:
            return ObjectId(val)
        except InvalidId:
            pass
    return None


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = mongo_uri.rsplit("/", 1)[-1].split("?")[0] or "seeds"
        db = client[db_name]
        col = db["users"]

        total_scanned = 0
        total_updated = 0

        async for doc in col.find({}, {"_id": 1, "school_id": 1, "tenant_id": 1}):
            total_scanned += 1
            updates: dict = {}

            for field in ("school_id", "tenant_id"):
                new_oid = _try_oid(doc.get(field))
                if new_oid is not None:
                    updates[field] = new_oid

            if not updates:
                continue

            doc_id = doc["_id"]
            fields_str = ", ".join(
                f'{k}: "{doc.get(k)}" -> ObjectId("{v}")'
                for k, v in updates.items()
            )
            print(f"  [{doc_id}] {fields_str}")

            if not dry_run:
                await col.update_one({"_id": doc_id}, {"$set": updates})

            total_updated += 1

        action = "Would update" if dry_run else "Updated"
        print(f"\nScanned {total_scanned} users. {action} {total_updated} documents.")
        if dry_run:
            print("Re-run without --dry-run to apply.")
    finally:
        client.close()
