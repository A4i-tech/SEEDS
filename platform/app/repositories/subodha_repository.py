"""Subodha course repository — Motor async data access for the subodhaCourses collection.

Every query is scoped to a `tenantId` — each tenant maintains its own synced
copy of a Subodha course, keyed by (tenantId, sourceId).

Ported from subodha/backend/src/{storage,contentList,diff}.ts.
"""
from __future__ import annotations

from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.platform.settings import get_settings
from app.repositories.base_repository import BaseRepository

_PROJECTION = {
    "sourceId": 1, "title": 1, "org": 1, "courseNumber": 1,
    "language": 1, "hidden": 1, "fetchedAt": 1, "lastRunId": 1,
}


class SubodhaRepository(BaseRepository):
    def __init__(self, db: AsyncIOMotorDatabase) -> None:
        self._col = db[get_settings().subodha_collection_name]

    async def save_course(self, tenant_id: str, source_id: str, doc: dict[str, Any]) -> None:
        await self._col.update_one(
            {"tenantId": tenant_id, "sourceId": source_id},
            {"$set": {**doc, "tenantId": tenant_id}},
            upsert=True,
        )

    async def load_course(self, tenant_id: str, source_id: str) -> dict[str, Any] | None:
        return await self._col.find_one({"tenantId": tenant_id, "sourceId": source_id})

    async def list_content(self, tenant_id: str) -> list[dict[str, Any]]:
        return await self._col.find({"tenantId": tenant_id}, projection=_PROJECTION).to_list(length=None)

    async def stored_source_ids(self, tenant_id: str) -> set[str]:
        return set(await self._col.distinct("sourceId", {"tenantId": tenant_id}))

    async def delete_course(self, tenant_id: str, source_id: str) -> int:
        result = await self._col.delete_one({"tenantId": tenant_id, "sourceId": source_id})
        return result.deleted_count

    async def update_block(self, tenant_id: str, source_id: str, block_id: str, updates: dict[str, Any]) -> int:
        """Edit fields on one block within the course's `blocks` array in place.

        NOTE: a full re-sync overwrites `blocks` wholesale (see save_course),
        so edits made here are lost the next time this course is synced.
        """
        set_fields = {f"blocks.$[b].{k}": v for k, v in updates.items()}
        result = await self._col.update_one(
            {"tenantId": tenant_id, "sourceId": source_id},
            {"$set": set_fields},
            array_filters=[{"b.blockId": block_id}],
        )
        return result.modified_count
