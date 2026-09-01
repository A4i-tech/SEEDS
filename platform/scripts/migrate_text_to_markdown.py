"""One-off: contentAggregators.item_type 'text' -> 'markdown'.

The ItemType enum value was renamed from "text" to "markdown"; existing
documents stored before the rename must be updated or CanonicalNode.from_doc
raises on ItemType("text").
"""
from __future__ import annotations

import asyncio
import logging

from pymongo.asynchronous.database import AsyncDatabase

from app.repositories.content_aggregator_repository import ContentAggregatorRepository

logger = logging.getLogger(__name__)


async def migrate(db: AsyncDatabase) -> int:
    result = await db[ContentAggregatorRepository.COLLECTION_NAME].update_many(
        {"item_type": "text"}, {"$set": {"item_type": "markdown"}}
    )
    logger.info("migrated %d nodes text->markdown", result.modified_count)
    return result.modified_count


async def _main() -> None:
    from app.platform.database import get_database, init_database

    await init_database()
    n = await migrate(get_database())
    print(f"migrated {n} nodes text->markdown")


if __name__ == "__main__":
    asyncio.run(_main())
