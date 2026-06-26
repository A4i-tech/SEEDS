#!/usr/bin/env python3
"""Migration 017 — contentsV3: convert UUID string _id to ObjectId.

ContentRepository used to set _id = uuid4() string. Since _id is immutable:
  1. Preserve old UUID as content_id field (for reference only).
  2. Insert new doc with auto ObjectId _id.
  3. Delete old doc.

After this migration, all ContentRepository queries use {"_id": _to_id(id)}
where id is the ObjectId hex string exposed via content.id.
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
        col = db["contentsV3"]

        total = await col.count_documents({})
        print(f"contentsV3: {total} total documents")

        docs: list[dict[str, Any]] = await col.find({}).to_list(length=None)
        string_ids = [d for d in docs if isinstance(d["_id"], str)]
        print(f"  UUID string _ids to convert: {len(string_ids)}")

        if not string_ids:
            print("  Nothing to do.")
            return

        converted = 0
        for doc in string_ids:
            old_uuid = doc["_id"]
            new_doc = {k: v for k, v in doc.items() if k != "_id"}
            new_doc["_id"] = ObjectId()
            new_doc["content_id"] = old_uuid
            print(f"  {old_uuid!r} -> {new_doc['_id']} (content_id={old_uuid!r})")
            if not dry_run:
                await col.insert_one(new_doc)
                await col.delete_one({"_id": old_uuid})
            converted += 1

        print(f"  Converted: {converted} (dry-run={dry_run})")
    finally:
        client.close()
