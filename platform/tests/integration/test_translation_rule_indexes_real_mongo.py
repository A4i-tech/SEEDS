from __future__ import annotations

import os
import uuid

import pytest
from pymongo import AsyncMongoClient
from pymongo.errors import DuplicateKeyError

from app.repositories.translation_rule_repository import TranslationRuleRepository

MONGO_URI = os.environ.get("SEEDS_TEST_MONGO_URI")

pytestmark = [
    pytest.mark.asyncio,
    pytest.mark.skipif(not MONGO_URI, reason="SEEDS_TEST_MONGO_URI is not set (needs a real MongoDB)"),
]


@pytest.fixture
async def db():
    client = AsyncMongoClient(MONGO_URI)
    database = client[f"zz_translation_rules_{uuid.uuid4().hex[:8]}"]
    yield database
    await client.drop_database(database.name)
    await client.close()


async def test_unique_index_rejects_the_same_rule_twice(db):
    await TranslationRuleRepository.ensure_indexes(db)
    repo = TranslationRuleRepository(db)
    fields = {"kind": "override", "text": "Dates", "lang": "hi", "translation": "x"}
    await repo.insert("s1", fields, "u1")

    with pytest.raises(DuplicateKeyError):
        await repo.insert("s1", fields, "u1")
    await repo.insert("s2", fields, "u1")
    await repo.insert("s1", {**fields, "lang": "mr"}, "u1")
