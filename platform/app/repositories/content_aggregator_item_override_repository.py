"""Content aggregator item override repository — per-tenant quiz edits layered
over the shared canonical contentAggregators node, so one tenant editing a
question/choices via SubodhaService.update_problem_block doesn't change what
every other tenant sharing that node sees.
"""
from __future__ import annotations

from typing import ClassVar

from fastapi import Depends
from pymongo.asynchronous.database import AsyncDatabase

from app.platform.auth.dependencies import get_db


class ContentAggregatorItemOverrideRepository:
    COLLECTION_NAME: ClassVar[str] = "contentAggregatorItemOverrides"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def upsert(
        self, tenant_id: str, source_type: str, source_id: str, question: str, choices: list[dict[str, object]]
    ) -> None:
        await self._col.update_one(
            {"tenant_id": tenant_id, "source_type": source_type, "source_id": source_id},
            {"$set": {"question": question, "choices": choices}},
            upsert=True,
        )

    async def list_by_tree(
        self, tenant_id: str, source_type: str, source_ids: list[str]
    ) -> dict[str, dict[str, object]]:
        docs = await self._col.find(
            {"tenant_id": tenant_id, "source_type": source_type, "source_id": {"$in": source_ids}}
        ).to_list(length=None)
        return {d["source_id"]: d for d in docs}


def get_content_aggregator_item_override_repo(
    db: AsyncDatabase = Depends(get_db),
) -> ContentAggregatorItemOverrideRepository:
    return ContentAggregatorItemOverrideRepository(db)
