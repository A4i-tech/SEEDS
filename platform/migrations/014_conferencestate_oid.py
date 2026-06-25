#!/usr/bin/env python3
"""Migration 014 — conferenceState: convert UUID string _id to ObjectId.

Old docs used the Vonage conference UUID as _id. Since _id is immutable:
  1. Copy old UUID to conference_id field (if not already set).
  2. Insert new doc with auto ObjectId _id.
  3. Delete old doc.

ConferenceRepository queries by conference_id field, so this field must be
populated for existing docs.
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
        col = db["conferenceState"]

        total = await col.count_documents({})
        print(f"conferenceState: {total} total documents")

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
            # Preserve UUID as conference_id if not already present
            if not new_doc.get("conference_id"):
                new_doc["conference_id"] = old_uuid
            print(f"  {old_uuid!r} -> {new_doc['_id']} (conference_id={new_doc['conference_id']!r})")
            if not dry_run:
                await col.insert_one(new_doc)
                await col.delete_one({"_id": old_uuid})
            converted += 1

        print(f"  Converted: {converted} (dry-run={dry_run})")
    finally:
        client.close()
