from __future__ import annotations

import pytest

from scripts.migrate_text_to_markdown import migrate
from tests.support.mongomock_async import AsyncMongoMockClient


@pytest.mark.asyncio
async def test_migrate_flips_only_text_nodes():
    db = AsyncMongoMockClient()["test_seeds"]
    await db["contentAggregators"].insert_many(
        [
            {"_id": "1", "item_type": "text"},
            {"_id": "2", "item_type": "text"},
            {"_id": "3", "item_type": "video"},
            {"_id": "4", "item_type": None},
        ]
    )

    modified = await migrate(db)

    assert modified == 2
    assert (await db["contentAggregators"].find_one({"_id": "1"}))["item_type"] == "markdown"
    assert (await db["contentAggregators"].find_one({"_id": "3"}))["item_type"] == "video"
