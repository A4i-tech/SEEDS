#!/usr/bin/env python3
"""Migration 012 — callsLogs: convert string _id fields to ObjectId.

Legacy documents in callsLogs have plain-string _ids that pre-date the
ObjectId convention. Since _id is immutable, we insert a new doc with a
generated ObjectId and delete the old one.
"""
from __future__ import annotations

import sys
from typing import Any

from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorClient


async def migrate(mongo_uri: str, dry_run: bool) -> None:
    sys.stdout.reconfigure(encoding="utf-8")  # type: ignore[attr-defined]
    client: AsyncIOMotorClient = AsyncIOMotorClient(mongo_uri)  # type: ignore[type-arg]
    try:
        db_name = mongo_uri.rsplit("/", 1)[-1].split("?")[0] or "seeds"
        db = client[db_name]
        col = db["callsLogs"]

        total = await col.count_documents({})
        print(f"callsLogs: {total} total documents")

        cursor = col.find({})
        docs: list[dict[str, Any]] = await cursor.to_list(length=None)

        string_ids = [d for d in docs if isinstance(d["_id"], str)]
        print(f"  String _ids to convert: {len(string_ids)}")

        if not string_ids:
            print("  Nothing to do.")
            return

        converted = 0
        for doc in string_ids:
            old_id = doc["_id"]
            new_doc = {k: v for k, v in doc.items() if k != "_id"}
            new_doc["_id"] = ObjectId()
            print(f"  {old_id!r} -> {new_doc['_id']}")
            if not dry_run:
                await col.insert_one(new_doc)
                await col.delete_one({"_id": old_id})
            converted += 1

        print(f"  Converted: {converted} (dry-run={dry_run})")
    finally:
        client.close()
