from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from pymongo.asynchronous.database import AsyncDatabase
from pymongo.errors import DuplicateKeyError

from app.repositories.base_repository import BaseRepository

REQUIRED_FIELDS = ("language", "wrong", "right")
KEY_FIELDS = ("kind", "language", "grade", "subject", "wrong")


def _public(row: dict[str, Any]) -> dict[str, Any]:
    row["_id"] = str(row["_id"])
    return row


class OcrCorrectionRepository(BaseRepository):
    COLLECTION = "ocr_corrections"

    def __init__(self, db: AsyncDatabase) -> None:
        self._col = db[self.COLLECTION]

    @classmethod
    async def ensure_indexes(cls, db: AsyncDatabase) -> None:
        await db[cls.COLLECTION].create_index([(field, 1) for field in KEY_FIELDS], unique=True)

    async def add(self, doc: dict[str, Any]) -> dict[str, Any]:
        for field in REQUIRED_FIELDS:
            if not str(doc.get(field) or "").strip():
                raise ValueError(f"OCR correction is missing '{field}'. Fill '{field}' and try again.")
        row = {
            "kind": doc.get("kind", "ocr"),
            "language": doc["language"].strip().lower(),
            "wrong": doc["wrong"],
            "right": doc["right"],
            "grade": doc["grade"],
            "subject": doc["subject"],
            "context": doc["context"],
            "page": doc["page"],
            "status": doc["status"],
            "source": doc["source"],
            "added_by": doc["added_by"],
            "added_at": doc.get("added_at") or datetime.now(UTC),
        }
        try:
            result = await self._col.insert_one(row)
        except DuplicateKeyError:
            return _public(await self._col.find_one({k: row[k] for k in KEY_FIELDS}))
        row["_id"] = str(result.inserted_id)
        return row

    async def find_by_id(self, correction_id: str) -> dict[str, Any] | None:
        row = await self._col.find_one({"_id": self._to_id(correction_id)})
        return _public(row) if row else None

    async def find_approved(self) -> list[dict[str, Any]]:
        return [r for r in await self.find_by_status("approved") if r["kind"] == "ocr"]

    async def find_by_status(self, status: str | None) -> list[dict[str, Any]]:
        query = {} if status is None else {"status": status}
        return [_public(r) for r in await self._col.find(query).to_list(length=None)]

    async def set_status(self, correction_id: str, status: str) -> None:
        await self._col.update_one({"_id": self._to_id(correction_id)}, {"$set": {"status": status}})
