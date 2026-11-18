from __future__ import annotations

from datetime import UTC, datetime
from typing import ClassVar

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import Depends
from pymongo import ReturnDocument
from pymongo.asynchronous.database import AsyncDatabase

from app.platform.auth.dependencies import get_db
from app.platform.error_handling import NotFoundError


def _oid(book_id: str) -> ObjectId:
    try:
        return ObjectId(book_id)
    except InvalidId as exc:
        raise NotFoundError("Book", book_id) from exc


def _public(doc: dict[str, object]) -> dict[str, object]:
    return {
        "book_id": str(doc["_id"]), "title": doc["title"], "language": doc["language"],
        "job_ids": doc["job_ids"], "created_at": doc["created_at"], "built": doc["built"],
    }


class TextbookBookRepository:
    COLLECTION_NAME: ClassVar[str] = "textbookRemediationBooks"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION_NAME]

    async def create(
        self, *, book_id: ObjectId, tenant_id: str, title: str, language: str, job_ids: list[str]
    ) -> dict[str, object]:
        doc = {
            "_id": book_id, "tenant_id": tenant_id, "title": title, "language": language,
            "job_ids": job_ids, "created_at": datetime.now(UTC).isoformat(), "deleted_at": None, "built": {},
        }
        await self._col.insert_one(doc)
        return _public(doc)

    async def get(self, tenant_id: str, book_id: str) -> dict[str, object] | None:
        doc = await self._col.find_one({"_id": _oid(book_id), "tenant_id": tenant_id, "deleted_at": None})
        return _public(doc) if doc else None

    async def list_books(self, tenant_id: str) -> list[dict[str, object]]:
        docs = await self._col.find({"tenant_id": tenant_id, "deleted_at": None}).sort("created_at", -1).to_list(length=None)
        return [_public(d) for d in docs]

    async def _set(self, tenant_id: str, book_id: str, fields: dict[str, object]) -> dict[str, object] | None:
        doc = await self._col.find_one_and_update(
            {"_id": _oid(book_id), "tenant_id": tenant_id, "deleted_at": None},
            {"$set": fields}, return_document=ReturnDocument.AFTER,
        )
        return _public(doc) if doc else None

    async def set_order(self, tenant_id: str, book_id: str, job_ids: list[str]) -> dict[str, object] | None:
        return await self._set(tenant_id, book_id, {"job_ids": job_ids})

    async def set_built(self, tenant_id: str, book_id: str, built: dict[str, object]) -> None:
        await self._set(tenant_id, book_id, {"built": built})

    async def soft_delete(self, tenant_id: str, book_id: str) -> dict[str, object] | None:
        return await self._set(tenant_id, book_id, {"deleted_at": datetime.now(UTC).isoformat()})


def get_textbook_book_repo(db: AsyncDatabase = Depends(get_db)) -> TextbookBookRepository:
    return TextbookBookRepository(db)
