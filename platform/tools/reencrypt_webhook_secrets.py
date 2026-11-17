#!/usr/bin/env python3
"""
Re-encrypt every stored webhook secret with the first WEBHOOK_SECRET_ENCRYPTION_KEY.

Key rotation: prepend the new key (WEBHOOK_SECRET_ENCRYPTION_KEY=new,old), deploy,
run this script, then drop the old key.

Usage:
    python -m tools.reencrypt_webhook_secrets
"""

from __future__ import annotations

import asyncio

from app.platform.auth.webhook_secret import reencrypt_secret
from app.platform.database import close_database, get_database, init_database
from app.repositories.content_aggregator_webhook_repository import (
    SECRET_ENCRYPTED_FIELD,
    ContentAggregatorWebhookRepository,
)


async def reencrypt_all(col) -> tuple[int, list]:
    count = 0
    skipped = []
    async for doc in col.find({}, {SECRET_ENCRYPTED_FIELD: 1}):
        original = doc[SECRET_ENCRYPTED_FIELD]
        result = await col.update_one(
            {"_id": doc["_id"], SECRET_ENCRYPTED_FIELD: original},
            {"$set": {SECRET_ENCRYPTED_FIELD: reencrypt_secret(original)}},
        )
        if result.matched_count:
            count += 1
        else:
            skipped.append(doc["_id"])
    return count, skipped


async def main() -> None:
    await init_database()
    try:
        col = get_database()[ContentAggregatorWebhookRepository.COLLECTION_NAME]
        count, skipped = await reencrypt_all(col)
        print(f"Re-encrypted {count} webhook secret(s).")
        if skipped:
            print(f"WARNING: skipped {len(skipped)} secret(s) changed concurrently; re-run: {skipped}")
    finally:
        await close_database()


if __name__ == "__main__":
    asyncio.run(main())
